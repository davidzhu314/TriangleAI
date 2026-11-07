/**
 * Case loader and validator (spec §3.5). Screens import from here.
 *
 *   const result = await loadCase({ kind: 'zip', data: file });            // imported
 *   const result = await loadCase(bundled[0].source);                     // from listBundledCases()
 *   if (result.ok) use(result.case); else show(result.results);
 *   // accept a fix from result.case.validation[i].fix:
 *   const again = await loadCase(sameSource, { fixes: [...accepted, fix] });
 */
export { loadCase, type LoadOptions } from './load';
export { BUNDLED_CASES_URL, listBundledCases, PackageError, type CaseFileName, type CaseSource } from './sources';
