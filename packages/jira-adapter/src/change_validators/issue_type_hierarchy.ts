/*
*                      Copyright 2023 Salto Labs Ltd.
*
* Licensed under the Apache License, Version 2.0 (the "License");
* you may not use this file except in compliance with
* the License.  You may obtain a copy of the License at
*
*     http://www.apache.org/licenses/LICENSE-2.0
*
* Unless required by applicable law or agreed to in writing, software
* distributed under the License is distributed on an "AS IS" BASIS,
* WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
* See the License for the specific language governing permissions and
* limitations under the License.
*/
import { ChangeError, ChangeValidator, getChangeData, InstanceElement, isInstanceChange, SeverityLevel, Change, ModificationChange, AdditionChange, isAdditionOrModificationChange, isEqualValues, isAdditionChange, isModificationChange } from '@salto-io/adapter-api'
import { collections } from '@salto-io/lowerdash'
import { ISSUE_TYPE_NAME } from '../constants'
import { isFreeLicense } from '../utils'

const { awu } = collections.asynciterable

const getIssueTypeWithHierachyChanges = (changes: ReadonlyArray<Change>): (
    AdditionChange<InstanceElement> | ModificationChange<InstanceElement>)[] => changes.filter(isInstanceChange)
  .filter(isAdditionOrModificationChange)
  .filter(change => getChangeData(change).elemID.typeName === ISSUE_TYPE_NAME)
  .filter(change => {
    if ((isAdditionChange(change) && change.data.after.value.hierarchyLevel > 0) || (isModificationChange(change)
    && !isEqualValues(change.data.before.value.hierarchyLevel, change.data.after.value.hierarchyLevel))) {
      return true
    }
    return false
  })

const getIsuueTypeHierarchyErrorMessage = (instance: InstanceElement): ChangeError => ({
  elemID: instance.elemID,
  severity: 'Error' as SeverityLevel,
  message: 'Cannot deploy issue type with hierarchy level greater than 0.',
  detailedMessage: 'Issue type hierarchy level can only be -1, 0. To deploy, change the hierarchy level to one of the allowed values.',
})

const getIsuueTypeHierearchyWarningMessage = (instance: InstanceElement): ChangeError => ({
  elemID: instance.elemID,
  severity: 'Warning' as SeverityLevel,
  message: 'Unsupported hierarchy Level',
  detailedMessage: `${instance.value.name} hierarchy level is unsupported for deployment. You will need to change it to your desired hierarchy level through the service. Please follow the instructions to make the necessary adjustments.`,
  deployActions: {
    postAction: {
      title: 'Hierarchy level change is required',
      description: 'To change the hierarchy level to the desired hierarchy level, follow these steps:',
      showOnFailure: false,
      subActions: [
        'Go to Issue type hierarchy page in your jira account.',
        'Under "Jira Issue Types" column, Click on your desired hierarchy level.',
        `Select ${instance.value.name} from the list of issue types.`,
        'Click on the "Save changes" button.',
      ],
    },
  },
})

const proccessIssueTypeHierarchy = (instance: InstanceElement, isLicenseFree: boolean):
ChangeError => {
  if (isLicenseFree === false || instance.value.hierarchyLevel <= 0) {
    return getIsuueTypeHierearchyWarningMessage(instance)
  }
  return getIsuueTypeHierarchyErrorMessage(instance)
}


export const issueTypeHierarchyValidator: ChangeValidator = async (changes, elementSource) => {
  if (elementSource === undefined) {
    return []
  }
  const relevantChanges = getIssueTypeWithHierachyChanges(changes)
  const isLicenseFree = await isFreeLicense(elementSource)
  return awu(relevantChanges)
    .map(getChangeData)
    .map(instance => proccessIssueTypeHierarchy(instance, isLicenseFree))
    .toArray()
}
