import * as TS from 'typescript'
import {
  TextFile,
  ParseFailure,
  ParseSuccess,
  RevisionsState,
  ImportDetails,
  Imports,
  HighlightBoundsForUids,
  ParsedJSONFailure,
  ParsedJSONSuccess,
  ImportAlias,
  isParseSuccess,
  ExportsDetail,
} from '../../shared/project-file-types'
import { fastForEach } from '../../shared/utils'
import { defaultIfNull } from '../../shared/optional-utils'
import { ErrorMessage } from '../../shared/error-messages'

import { printCode, printCodeOptions } from '../parser-printer/parser-printer'
import { ArbitraryJSBlock, Comment, TopLevelElement } from '../../shared/element-template'

export function codeNeedsPrinting(revisionsState: RevisionsState): boolean {
  return revisionsState === RevisionsState.ParsedAhead
}

export function codeNeedsParsing(revisionsState: RevisionsState): boolean {
  return revisionsState === RevisionsState.CodeAhead
}

export function getTextFileContents(
  file: TextFile,
  pretty: boolean,
  allowPrinting: boolean,
): string {
  if (
    allowPrinting &&
    codeNeedsPrinting(file.fileContents.revisionsState) &&
    isParseSuccess(file.fileContents.parsed)
  ) {
    return printCode(
      printCodeOptions(false, pretty, true),
      file.fileContents.parsed.imports,
      file.fileContents.parsed.topLevelElements,
      file.fileContents.parsed.jsxFactoryFunction,
      file.fileContents.parsed.exportsDetail,
    )
  } else {
    return file.fileContents.code
  }
}

export function emptyImports(): Imports {
  return {}
}

function mergeImportDetails(first: ImportDetails, second: ImportDetails): ImportDetails {
  let importedFromWithin: Array<ImportAlias> = [...first.importedFromWithin]
  fastForEach(second.importedFromWithin, (secondWithin) => {
    if (
      importedFromWithin.find(
        (i) => i.name === secondWithin.name && i.alias === secondWithin.alias,
      ) == null
    ) {
      importedFromWithin.push(secondWithin)
    }
  })
  const importedWithName = defaultIfNull(second.importedWithName, first.importedWithName)
  const importedAs = defaultIfNull(second.importedAs, first.importedAs)
  return {
    importedWithName: importedWithName,
    importedFromWithin: importedFromWithin,
    importedAs: importedAs,
  }
}

export function mergeImports(first: Imports, second: Imports): Imports {
  let combinedKeys: Array<string> = Object.keys(first)
  fastForEach(Object.keys(second), (s) => {
    if (!combinedKeys.includes(s)) {
      combinedKeys.push(s)
    }
  })
  let imports: Imports = {}
  combinedKeys.forEach((key) => {
    const firstValue = first[key]
    const secondValue = second[key]
    if (firstValue === undefined) {
      if (secondValue !== undefined) {
        imports[key] = secondValue
      }
    } else {
      if (secondValue === undefined) {
        imports[key] = firstValue
      } else {
        imports[key] = mergeImportDetails(firstValue, secondValue)
      }
    }
  })
  return imports
}

export function addImport(
  importedFrom: string,
  importedWithName: string | null,
  importedFromWithin: Array<ImportAlias>,
  importedAs: string | null,
  imports: Imports,
): Imports {
  const toAdd: Imports = {
    [importedFrom]: {
      importedWithName: importedWithName,
      importedFromWithin: importedFromWithin,
      importedAs: importedAs,
    },
  }
  return mergeImports(imports, toAdd)
}

export function parseSuccess(
  imports: Imports,
  topLevelElements: Array<TopLevelElement>,
  highlightBounds: HighlightBoundsForUids,
  jsxFactoryFunction: string | null,
  combinedTopLevelArbitraryBlock: ArbitraryJSBlock | null,
  exportsDetail: ExportsDetail,
): ParseSuccess {
  return {
    type: 'PARSE_SUCCESS',
    imports: imports,
    topLevelElements: topLevelElements,
    highlightBounds: highlightBounds,
    jsxFactoryFunction: jsxFactoryFunction,
    combinedTopLevelArbitraryBlock: combinedTopLevelArbitraryBlock,
    exportsDetail: exportsDetail,
  }
}

export function parseFailure(
  diagnostics: Array<TS.Diagnostic> | null,
  parsedJSON: ParsedJSONFailure | null,
  errorMessage: string | null,
  errorMessages: Array<ErrorMessage>,
): ParseFailure {
  return {
    type: 'PARSE_FAILURE',
    diagnostics: diagnostics,
    parsedJSONFailure: parsedJSON,
    errorMessage: errorMessage,
    errorMessages: errorMessages,
  }
}

export function parsedJSONSuccess(value: any): ParsedJSONSuccess {
  return {
    type: 'SUCCESS',
    value: value,
  }
}

export function parsedJSONFailure(
  errorNode: TS.Node,
  codeSnippet: string,
  reason: string,
  startLine: number,
  startCol: number,
  endLine: number,
  endCol: number,
): ParsedJSONFailure {
  return {
    type: 'FAILURE',
    errorNode: errorNode,
    codeSnippet: codeSnippet,
    reason: reason,
    startLine: startLine,
    startCol: startCol,
    endLine: endLine,
    endCol: endCol,
  }
}
