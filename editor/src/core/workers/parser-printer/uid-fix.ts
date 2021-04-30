import { MapLike } from 'typescript'
import {
  isJSXElement,
  isUtopiaJSXComponent,
  JSXElementChild,
  TopLevelElement,
  UtopiaJSXComponent,
} from '../../shared/element-template'
import { optionalMap } from '../../shared/optional-utils'
import {
  isParseSuccess,
  ParsedTextFile,
  StaticElementPathPart,
} from '../../shared/project-file-types'
import * as EP from '../../shared/element-path'
import { setUtopiaIDOnJSXElement } from '../../shared/uid-utils'
import {
  findJSXElementChildAtPath,
  getUtopiaID,
  transformJSXComponentAtElementPath,
} from '../../model/element-template-utils'
import {
  applyUtopiaJSXComponentsChanges,
  getComponentsFromTopLevelElements,
} from '../../model/project-file-utils'
import { mapArrayToDictionary } from '../../shared/array-utils'
import { emptySet } from '../../shared/set-utils'
import { fastForEach } from '../../shared/utils'

export function fixParseSuccessUIDs(
  oldParsed: ParsedTextFile | null,
  newParsed: ParsedTextFile,
): ParsedTextFile {
  if (oldParsed == null || !isParseSuccess(oldParsed) || !isParseSuccess(newParsed)) {
    // we won't try to fix parse failures
    return newParsed
  }

  let newToOldUidMapping: {
    [newUID: string]: {
      oldUID: string
      newUID: string
      pathToModify: StaticElementPathPart
      oldPathToRestore: StaticElementPathPart
    }
  } = {}

  zipTopLevelElements(
    oldParsed.topLevelElements,
    newParsed.topLevelElements,
    (
      oldUID: string,
      newUID: string,
      oldPathToRestore: StaticElementPathPart,
      newPath: StaticElementPathPart,
    ) => {
      if (oldUID !== newUID) {
        // we have a UID mismatch
        newToOldUidMapping[newUID] = {
          oldUID: oldUID,
          newUID: newUID,
          pathToModify: newPath,
          oldPathToRestore: oldPathToRestore,
        }
      }
    },
  )

  const newToOldUidMappingArray = Object.values(newToOldUidMapping)

  if (newToOldUidMappingArray.length !== 1) {
    // we found no uid mismatch or we found too many mismatched UIDs and so we bail out
    return newParsed
  } else {
    // we found a single UID mismatch, which means there's a very good chance that it was an update element, let's fix that up
    let workingComponents = getComponentsFromTopLevelElements(newParsed.topLevelElements)

    newToOldUidMappingArray.forEach((mapping) => {
      const oldPathAlreadyExistingElement = findJSXElementChildAtPath(
        workingComponents,
        EP.elementPath([mapping.oldPathToRestore]),
      )

      if (oldPathAlreadyExistingElement == null) {
        workingComponents = transformJSXComponentAtElementPath(
          workingComponents,
          mapping.pathToModify,
          (element) => {
            return setUtopiaIDOnJSXElement(element, mapping.oldUID)
          },
        )
      } else {
        // this is awkward, there is already an element with this UID. it means we need to bail out from this update
        return
      }
    })

    const fixedTopLevelElements = applyUtopiaJSXComponentsChanges(
      newParsed.topLevelElements,
      workingComponents,
    )

    const fixedHighlightBounds = mapArrayToDictionary(
      Object.values(newParsed.highlightBounds),
      (highlightBound) => {
        const uidFix = newToOldUidMapping[highlightBound.uid]
        if (uidFix != null) {
          return uidFix.oldUID
        } else {
          return highlightBound.uid
        }
      },
      (highlightBound) => {
        const uidFix = newToOldUidMapping[highlightBound.uid]
        if (uidFix != null) {
          return {
            ...highlightBound,
            uid: uidFix.oldUID,
          }
        } else {
          return highlightBound
        }
      },
    )

    return {
      ...newParsed,
      topLevelElements: fixedTopLevelElements,
      highlightBounds: fixedHighlightBounds,
    }
  }
}

function zipTopLevelElements(
  firstTopLevelElements: Array<TopLevelElement>,
  secondTopLevelElements: Array<TopLevelElement>,
  onElement: (
    oldUID: string,
    newUID: string,
    oldPathToRestore: StaticElementPathPart,
    newElementPath: StaticElementPathPart,
  ) => void,
): void {
  secondTopLevelElements.forEach((newTopLevelElement, index) => {
    if (isUtopiaJSXComponent(newTopLevelElement)) {
      const uid = getUtopiaID(newTopLevelElement.rootElement)

      const oldTopLevelElement = firstTopLevelElements.find((tle): tle is UtopiaJSXComponent => {
        return isUtopiaJSXComponent(tle) && getUtopiaID(tle.rootElement) === uid
      })

      if (oldTopLevelElement != null) {
        walkElementChildren(
          EP.emptyElementPathPart,
          [oldTopLevelElement.rootElement],
          [newTopLevelElement.rootElement],
          onElement,
        )
      }
    }
  })
}

function walkElementChildren(
  pathSoFar: StaticElementPathPart,
  oldElements: Array<JSXElementChild>,
  newElements: Array<JSXElementChild>,
  onElement: (
    oldUID: string,
    newUID: string,
    oldPathToRestore: StaticElementPathPart,
    newElementPath: StaticElementPathPart,
  ) => void,
): void {
  /**
   * this first version works by trying to match up indexes. this is really primitive.
   * here's some ideas how could we improve it
   * • before correcting a UID, make sure the uids of the preceding and proceding siblings are matching! this makes the comparison more robust and makes us less exposed to off-by-one errors
   * • try to match offsets: if the user deletes or inserts an element, all subsequent uids will be shifted and thus mismatched in an index-to-index comparison
   */

  newElements.forEach((newElement, index) => {
    const oldElement: JSXElementChild | null = oldElements[index]

    if (
      oldElement != null &&
      newElement != null &&
      isJSXElement(oldElement) &&
      isJSXElement(newElement)
    ) {
      const oldUID = getUtopiaID(oldElement)
      const newUid = getUtopiaID(newElement)
      const path = EP.appendToElementPath(pathSoFar, newUid)
      const oldPathToRestore = EP.appendToElementPath(pathSoFar, oldUID)
      onElement(oldUID, newUid, oldPathToRestore, path)
      walkElementChildren(path, oldElement.children, newElement.children, onElement)
    }
  })
}
