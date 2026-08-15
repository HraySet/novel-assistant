//! 原生文件拖出（Windows）。
//!
//! 通过 OLE 的 DoDragDrop + CF_HDROP 实现真实文件拖出，必须在主线程执行：
//! 工作线程没有消息泵与鼠标捕获权，会导致拖拽挂起或各种初始化错误。
//! 拖拽数据同时携带三种格式，由落点自己挑选（类似 Obsidian 的做法）：
//! - CF_HDROP：真实文件路径，只允许 DROPEFFECT_COPY → 拖出去永远是复制；
//! - CF_UNICODETEXT：源节点路径，拖回应用内时 WebView2 把它映射成 text/plain，
//!   原有内部移动逻辑无缝继续工作；
//! - UniformResourceLocator：file:/// 链接，拖到笔记软件/编辑器等文本类应用时
//!   能收到可点击的链接。

use std::ptr;

use windows_core::{implement, HRESULT, PCWSTR};
use windows::Win32::Foundation::{
    GlobalFree, HGLOBAL, DRAGDROP_S_CANCEL, DRAGDROP_S_DROP, DRAGDROP_S_USEDEFAULTCURSORS,
};
use windows::Win32::System::Com::{
    CoGetApartmentType, APTTYPE, APTTYPEQUALIFIER, DVASPECT_CONTENT, FORMATETC, IDataObject,
    IDataObject_Impl, IEnumFORMATETC, IEnumFORMATETC_Impl, STGMEDIUM, TYMED_HGLOBAL,
};
use windows::Win32::System::DataExchange::RegisterClipboardFormatW;
use windows::Win32::System::Memory::{GlobalAlloc, GlobalLock, GlobalUnlock, GHND};
use windows::Win32::System::Ole::{
    DoDragDrop, IDropSource, IDropSource_Impl, OleInitialize, OleUninitialize, DROPEFFECT,
    DROPEFFECT_COPY, DROPEFFECT_NONE,
};
use windows::Win32::System::SystemServices::{MK_LBUTTON, MK_MBUTTON, MK_RBUTTON, MODIFIERKEYS_FLAGS};

const CF_UNICODETEXT: u16 = 13;
const CF_HDROP: u16 = 15;

const S_OK: HRESULT = HRESULT(0);
const S_FALSE: HRESULT = HRESULT(1);
const E_NOTIMPL: HRESULT = HRESULT(0x8000_4001u32 as i32);
const E_OUTOFMEMORY: HRESULT = HRESULT(0x8007_000Eu32 as i32);
const DV_E_FORMATETC: HRESULT = HRESULT(0x8004_0064u32 as i32);
const DV_E_TYMED: HRESULT = HRESULT(0x8004_0069u32 as i32);
const OLE_E_ADVISENOTSUPPORTED: HRESULT = HRESULT(0x8004_0003u32 as i32);
const OLE_E_NOCONNECTION: HRESULT = HRESULT(0x8004_0004u32 as i32);

/// IEnumFORMATETC 的 DATADIR_GET
const DATADIR_GET: u32 = 1;

/// "UniformResourceLocator" 注册格式号（惰性注册一次）
fn uniform_resource_locator_format() -> u16 {
    static FMT: std::sync::OnceLock<u16> = std::sync::OnceLock::new();
    *FMT.get_or_init(|| unsafe {
        let name: Vec<u16> = "UniformResourceLocator".encode_utf16().chain(Some(0)).collect();
        RegisterClipboardFormatW(PCWSTR::from_raw(name.as_ptr())) as u16
    })
}

/// Windows 路径 → file:/// URI（非 ASCII 字节做百分号编码）
fn file_uri(path: &str) -> String {
    let mut out = String::from("file:///");
    for b in path.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' | b':' | b'/' | b'\\' => {
                out.push(b as char)
            }
            _ => out.push_str(&format!("%{:02X}", b)),
        }
    }
    out
}

/// 拖拽格式描述。
/// FORMATETC 含 *mut DVTARGETDEVICE，不是 Send，而 implement! 的 COM 对象要求 Send，
/// 所以这里只存格式号，调用时再拼出完整 FORMATETC。
#[derive(Clone, Copy)]
enum FormatKind {
    HDrop,
    UnicodeText,
    UniformResourceLocator,
}

#[derive(Clone, Copy)]
struct FormatSpec {
    cf: u16,
    kind: FormatKind,
}

impl FormatSpec {
    fn to_formatetc(self) -> FORMATETC {
        FORMATETC {
            cfFormat: self.cf,
            ptd: ptr::null_mut(),
            dwAspect: DVASPECT_CONTENT.0,
            lindex: -1,
            tymed: TYMED_HGLOBAL.0 as u32,
        }
    }
}

fn alloc_hglobal(bytes: &[u8]) -> windows_core::Result<HGLOBAL> {
    unsafe {
        let h = GlobalAlloc(GHND, bytes.len())?;
        let p = GlobalLock(h);
        if p.is_null() {
            let _ = GlobalFree(Some(h));
            return Err(E_OUTOFMEMORY.into());
        }
        ptr::copy_nonoverlapping(bytes.as_ptr(), p as *mut u8, bytes.len());
        let _ = GlobalUnlock(h);
        Ok(h)
    }
}

/// DROPFILES 头（20 字节）+ UTF-16LE 路径列表（双 null 结尾）
fn build_hdrop(paths: &[String]) -> Vec<u8> {
    let mut units: Vec<u16> = Vec::new();
    for p in paths {
        units.extend(p.encode_utf16());
        units.push(0);
    }
    units.push(0);

    let mut bytes = Vec::with_capacity(20 + units.len() * 2);
    bytes.extend_from_slice(&20u32.to_le_bytes()); // pFiles
    bytes.extend_from_slice(&0u32.to_le_bytes()); // pt.x
    bytes.extend_from_slice(&0u32.to_le_bytes()); // pt.y
    bytes.extend_from_slice(&0u32.to_le_bytes()); // fNC
    bytes.extend_from_slice(&1u32.to_le_bytes()); // fWide
    for u in units {
        bytes.extend_from_slice(&u.to_le_bytes());
    }
    bytes
}

/// 标准拖拽源：Esc 取消、松开全部鼠标键 = 放下、反馈交给系统默认光标
#[implement(IDropSource)]
struct DragDropSource;

impl IDropSource_Impl for DragDropSource_Impl {
    fn QueryContinueDrag(&self, fescapepressed: windows_core::BOOL, grfkeystate: MODIFIERKEYS_FLAGS) -> HRESULT {
        if fescapepressed.as_bool() {
            DRAGDROP_S_CANCEL
        } else if grfkeystate & (MK_LBUTTON | MK_MBUTTON | MK_RBUTTON) == MODIFIERKEYS_FLAGS(0) {
            DRAGDROP_S_DROP
        } else {
            S_OK
        }
    }

    fn GiveFeedback(&self, _dweffect: DROPEFFECT) -> HRESULT {
        DRAGDROP_S_USEDEFAULTCURSORS
    }
}

#[implement(IDataObject)]
struct DragData {
    hdrop: Vec<u8>,
    unicode: Vec<u16>,
    url: Vec<u8>,
    formats: Vec<FormatSpec>,
}

impl DragData {
    fn new(paths: &[String]) -> Self {
        let unicode: Vec<u16> = paths
            .first()
            .map(|p| p.encode_utf16().chain(Some(0)).collect())
            .unwrap_or_default();
        let mut url: Vec<u8> = paths
            .first()
            .map(|p| file_uri(p).into_bytes())
            .unwrap_or_default();
        if !url.is_empty() {
            url.push(0);
        }

        let mut formats = vec![
            FormatSpec { cf: CF_HDROP, kind: FormatKind::HDrop },
            FormatSpec { cf: CF_UNICODETEXT, kind: FormatKind::UnicodeText },
        ];
        let url_cf = uniform_resource_locator_format();
        if url_cf != 0 {
            formats.push(FormatSpec { cf: url_cf, kind: FormatKind::UniformResourceLocator });
        }

        Self {
            hdrop: build_hdrop(paths),
            unicode,
            url,
            formats,
        }
    }

    fn spec_of(&self, cf: u16) -> Option<&FormatSpec> {
        self.formats.iter().find(|f| f.cf == cf)
    }

    fn data_bytes(&self, spec: &FormatSpec) -> Option<Vec<u8>> {
        match spec.kind {
            FormatKind::HDrop => Some(self.hdrop.clone()),
            FormatKind::UnicodeText => {
                let mut bytes = Vec::with_capacity(self.unicode.len() * 2);
                for u in &self.unicode {
                    bytes.extend_from_slice(&u.to_le_bytes());
                }
                Some(bytes)
            }
            FormatKind::UniformResourceLocator => Some(self.url.clone()),
        }
    }
}

impl IDataObject_Impl for DragData_Impl {
    fn GetData(&self, pformatetcin: *const FORMATETC) -> windows_core::Result<STGMEDIUM> {
        let fe = unsafe { *pformatetcin };
        if fe.tymed as i32 != TYMED_HGLOBAL.0 {
            return Err(DV_E_TYMED.into());
        }
        let bytes = match self.spec_of(fe.cfFormat) {
            Some(spec) => self.data_bytes(spec),
            None => None,
        }
        .ok_or_else(|| {
            let e: windows_core::Error = DV_E_FORMATETC.into();
            e
        })?;
        let mut medium = STGMEDIUM::default();
        medium.tymed = TYMED_HGLOBAL.0 as u32;
        medium.u.hGlobal = alloc_hglobal(&bytes)?;
        medium.pUnkForRelease = core::mem::ManuallyDrop::new(None);
        Ok(medium)
    }

    fn GetDataHere(&self, pformatetc: *const FORMATETC, pmedium: *mut STGMEDIUM) -> windows_core::Result<()> {
        let fe = unsafe { *pformatetc };
        let medium = unsafe { &mut *pmedium };
        if medium.tymed as i32 != TYMED_HGLOBAL.0 {
            return Err(DV_E_TYMED.into());
        }
        let bytes = match self.spec_of(fe.cfFormat) {
            Some(spec) => self.data_bytes(spec),
            None => None,
        }
        .ok_or_else(|| {
            let e: windows_core::Error = DV_E_FORMATETC.into();
            e
        })?;
        unsafe {
            let p = GlobalLock(medium.u.hGlobal);
            if p.is_null() {
                return Err(E_OUTOFMEMORY.into());
            }
            ptr::copy_nonoverlapping(bytes.as_ptr(), p as *mut u8, bytes.len());
            let _ = GlobalUnlock(medium.u.hGlobal);
        }
        Ok(())
    }

    fn QueryGetData(&self, pformatetc: *const FORMATETC) -> HRESULT {
        let fe = unsafe { *pformatetc };
        if self.spec_of(fe.cfFormat).is_some() && fe.tymed as i32 == TYMED_HGLOBAL.0 {
            S_OK
        } else {
            DV_E_FORMATETC
        }
    }

    fn GetCanonicalFormatEtc(&self, _pformatectin: *const FORMATETC, _pformatetcout: *mut FORMATETC) -> HRESULT {
        E_NOTIMPL
    }

    fn SetData(
        &self,
        _pformatetc: *const FORMATETC,
        _pmedium: *const STGMEDIUM,
        _frelease: windows_core::BOOL,
    ) -> windows_core::Result<()> {
        Err(E_NOTIMPL.into())
    }

    fn EnumFormatEtc(&self, dwdirection: u32) -> windows_core::Result<IEnumFORMATETC> {
        let formats = if dwdirection == DATADIR_GET {
            self.formats.clone()
        } else {
            Vec::new()
        };
        Ok(FormatEnum::new(formats).into())
    }

    fn DAdvise(
        &self,
        _pformatetc: *const FORMATETC,
        _advf: u32,
        _padvsink: windows_core::Ref<'_, windows::Win32::System::Com::IAdviseSink>,
    ) -> windows_core::Result<u32> {
        Err(OLE_E_ADVISENOTSUPPORTED.into())
    }

    fn DUnadvise(&self, _dwconnection: u32) -> windows_core::Result<()> {
        Err(OLE_E_NOCONNECTION.into())
    }

    fn EnumDAdvise(&self) -> windows_core::Result<windows::Win32::System::Com::IEnumSTATDATA> {
        Err(E_NOTIMPL.into())
    }
}

#[implement(IEnumFORMATETC)]
struct FormatEnum {
    formats: Vec<FormatSpec>,
    index: std::cell::Cell<usize>,
}

impl FormatEnum {
    fn new(formats: Vec<FormatSpec>) -> Self {
        Self {
            formats,
            index: std::cell::Cell::new(0),
        }
    }
}

impl IEnumFORMATETC_Impl for FormatEnum_Impl {
    fn Next(&self, celt: u32, rgelt: *mut FORMATETC, pceltfetched: *mut u32) -> HRESULT {
        let mut fetched = 0u32;
        while fetched < celt {
            let i = self.index.get();
            if i >= self.formats.len() {
                break;
            }
            unsafe {
                *rgelt.add(fetched as usize) = self.formats[i].to_formatetc();
            }
            self.index.set(i + 1);
            fetched += 1;
        }
        if !pceltfetched.is_null() {
            unsafe {
                *pceltfetched = fetched;
            }
        }
        if fetched == celt {
            S_OK
        } else {
            S_FALSE
        }
    }

    fn Skip(&self, celt: u32) -> windows_core::Result<()> {
        let i = self.index.get();
        self.index.set((i + celt as usize).min(self.formats.len()));
        Ok(())
    }

    fn Reset(&self) -> windows_core::Result<()> {
        self.index.set(0);
        Ok(())
    }

    fn Clone(&self) -> windows_core::Result<IEnumFORMATETC> {
        Ok(FormatEnum {
            formats: self.formats.clone(),
            index: std::cell::Cell::new(self.index.get()),
        }
        .into())
    }
}

/// 执行原生拖放：阻塞直到用户松开鼠标/取消，返回最终效果值。
/// 必须在主线程调用（主线程拥有消息泵与鼠标捕获权）。
pub(crate) fn run_drag(paths: Vec<String>) -> Result<u32, String> {
    if let Some(p) = paths.first() {
        eprintln!("[drag-out] 拖出: {}", p);
    }
    unsafe {
        let mut apt = APTTYPE::default();
        let mut qual = APTTYPEQUALIFIER::default();
        let already = CoGetApartmentType(&mut apt, &mut qual).is_ok();
        eprintln!("[drag-out] 公寓类型: {} / {}", apt.0, qual.0);

        // 只在 COM 尚未初始化时由我们初始化；已初始化（如主线程）则原样保留，
        // 绝不反初始化别人建立的 COM 状态
        let initialized_by_us = if already {
            eprintln!("[drag-out] COM 已初始化，直接使用");
            false
        } else {
            match OleInitialize(None) {
                Ok(()) => {
                    eprintln!("[drag-out] OleInitialize -> OK");
                    true
                }
                Err(e) => {
                    eprintln!("[drag-out] OleInitialize 失败: {}", e);
                    false
                }
            }
        };
        let result = do_drag(paths);
        if initialized_by_us {
            OleUninitialize();
        }
        result
    }
}

fn do_drag(paths: Vec<String>) -> Result<u32, String> {
    if paths.is_empty() {
        return Ok(DROPEFFECT_NONE.0);
    }
    let data: IDataObject = DragData::new(&paths).into();
    // 显式提供 IDropSource：部分 Windows 版本不接受 NULL 拖拽源（返回 E_INVALIDARG）
    let source: IDropSource = DragDropSource.into();

    unsafe {
        let mut effect = DROPEFFECT_NONE;
        let hr = DoDragDrop(&data, &source, DROPEFFECT_COPY, &mut effect);
        if hr.is_err() {
            eprintln!("[drag-out] DoDragDrop 失败: 0x{:08X}", hr.0);
            return Err(format!("DoDragDrop 失败: 0x{:08X}", hr.0));
        }
        eprintln!("[drag-out] 结束, 效果: {}", effect.0);
        Ok(effect.0)
    }
}
