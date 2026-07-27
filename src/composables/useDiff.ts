/**
 * 行级 Diff：只做增删行检测，不做字级高亮。
 */

export interface DiffLine {
  type: 'add' | 'remove' | 'equal'
  content: string
  oldLine?: number
  newLine?: number
}

function computeLCS<T>(a: T[], b: T[], eq: (x: T, y: T) => boolean = (x, y) => x === y): number[][] {
  const m = a.length, n = b.length
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0))
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = eq(a[i - 1], b[j - 1]) ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1])
  return dp
}

function backtrack<T>(a: T[], b: T[], dp: number[][], makeResult: (type: 'add' | 'remove' | 'equal', i: number, j: number) => T): T[] {
  const result: T[] = []
  let i = a.length, j = b.length
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
      result.push(makeResult('equal', i - 1, j - 1)); i--; j--
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      result.push(makeResult('add', i - 1, j - 1)); j--
    } else {
      result.push(makeResult('remove', i - 1, j - 1)); i--
    }
  }
  result.reverse()
  return result
}

export function computeDiff(oldText: string, newText: string): DiffLine[] {
  const oldLines = oldText.replace(/\r\n/g, '\n').split('\n')
  const newLines = newText.replace(/\r\n/g, '\n').split('\n')
  const dp = computeLCS(oldLines, newLines)

  let oldLineNum = oldLines.length
  let newLineNum = newLines.length

  const raw = backtrack(oldLines, newLines, dp, (type, oi, ni) => ({
    type,
    content: type === 'remove' ? oldLines[oi] : newLines[ni],
    oldLine: type !== 'add' ? (oldLineNum - (oldLines.length - oi)) : undefined,
    newLine: type !== 'remove' ? (newLineNum - (newLines.length - ni)) : undefined,
  } as DiffLine))

  return raw
}
