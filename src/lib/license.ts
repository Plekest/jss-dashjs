// Conditional licence bootstrap — the single feature-flag for "pro mode".
//
// One key (VITE_JSS_LICENSE) activates three independent engines:
//  - jspreadsheet.setLicense(key)          → grid features (toolbar, etc.)
//  - jspreadsheet.setExtensions({ formula }) + formula.license(key)
//                                          → formula evaluation in cells
//  - jspreadsheet.setExtensions({ bar }) + jspreadsheet.bar(...)
//                                          → Excel-like formula/edition bar
//
// dashjs bundles its OWN copy of formula-pro, so the activation here does
// not reach it — the key is also passed via DashJsOptions.license (see
// DashboardEditorPage).
//
// Without a key nothing changes: same 'evaluation' licence as before, no
// formula extension, no formula bar, /sheets stays the simple grid.

import jspreadsheet from 'jspreadsheet'
import formula from '@jspreadsheet/formula-pro'
import bar from '@jspreadsheet/bar'
import '@jspreadsheet/bar/dist/style.css'

export const licenseKey: string | undefined = import.meta.env.VITE_JSS_LICENSE || undefined

export const hasProLicense = Boolean(licenseKey)

export function activateLicense(): boolean {
  if (!licenseKey) {
    jspreadsheet.setLicense('evaluation') // current behaviour
    return false
  }
  jspreadsheet.setLicense(licenseKey)
  jspreadsheet.setExtensions({ formula, bar }) // formulas in cells + formula bar (pro mode only)
  formula.license(licenseKey)                  // standalone engine
  jspreadsheet.bar?.({ suggestions: true })    // enable formula-name autocomplete in the bar
  return true
}
