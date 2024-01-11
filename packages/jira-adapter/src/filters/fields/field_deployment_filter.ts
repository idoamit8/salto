/*
*                      Copyright 2024 Salto Labs Ltd.
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
import { Change, createSaltoElementError, getChangeData, InstanceElement, isAdditionChange, isAdditionOrModificationChange, isInstanceChange, SaltoElementError, toChange } from '@salto-io/adapter-api'
import _ from 'lodash'
import { logger } from '@salto-io/logging'
import { client as clientUtils } from '@salto-io/adapter-components'
import { collections } from '@salto-io/lowerdash'
import JiraClient from '../../client/client'
import { FilterCreator } from '../../filter'
import { deployContextChange, getContexts, getContextType } from './contexts'
import { defaultDeployChange, deployChanges } from '../../deployment/standard_deployment'
import { FIELD_TYPE_NAME, IS_LOCKED } from './constants'
import { JiraConfig } from '../../config/config'

const { toArrayAsync } = collections.asynciterable
const { makeArray } = collections.array
const { awu } = collections.asynciterable
const log = logger(module)

const getAllFields = async (paginator: clientUtils.Paginator): Promise<Record<string, string>> => {
  const paginationArgs = {
    url: '/rest/api/3/field/search?query=service',
    paginationField: 'startAt',
  }
  const fieldValues = (await toArrayAsync(
    paginator(paginationArgs, page => makeArray(page.values) as clientUtils.ResponseValue[])
  )).flat()

  const fieldNameToId = Object.fromEntries(fieldValues.map(field => [field.name, field.id]))
  return fieldNameToId
}

const deployField = async (
  change: Change<InstanceElement>,
  client: JiraClient,
  config: JiraConfig,
): Promise<void> => {
  await defaultDeployChange({
    change,
    client,
    apiDefinitions: config.apiDefinitions,
    fieldsToIgnore: ['contexts'],
  })

  if (isAdditionChange(change)) {
    const contextType = await getContextType(await getChangeData(change).getType())
    // When creating a field, it is created with a default context,
    // in addition to what is in the NaCl so we need to delete it
    const removalContextsChanges = isAdditionChange(change)
      ? (await getContexts(change, contextType, client))
        .map(instance => toChange({ before: instance }))
      : []

    await awu(removalContextsChanges).forEach(contextChange => deployContextChange(
      contextChange,
      client,
      config.apiDefinitions
    ))
  }
}
const hasLockedFields = (changes: Change[]): boolean => {
  const fields = changes
    .filter(isInstanceChange)
    .filter(isAdditionChange)
    .map(getChangeData)
  return fields.some(instance => instance.value?.[IS_LOCKED] === true)
}

const filter: FilterCreator = ({ client, config, paginator }) => ({
  name: 'fieldDeploymentFilter',
  deploy: async changes => {
    const [relevantChanges, leftoverChanges] = _.partition(
      changes,
      change => isInstanceChange(change)
        && isAdditionOrModificationChange(change)
        && getChangeData(change).elemID.typeName === FIELD_TYPE_NAME
    )

    const allFieldsFromService = hasLockedFields(relevantChanges) ? await getAllFields(paginator) : undefined
    const errors: SaltoElementError[] = []

    const deployResult = await deployChanges(
      relevantChanges.filter(isInstanceChange),
      async change => {
        const inst = getChangeData(change)
        if (isAdditionChange(change) && inst.value?.[IS_LOCKED] === true && allFieldsFromService !== undefined) {
          if (allFieldsFromService[inst.value.name] !== undefined) {
            log.debug(`Field ${getChangeData(change).value.name} was auto-generated in Jira.`)
            inst.value.id = allFieldsFromService[inst.value.name]
            return
          }
          log.debug(`Field ${inst.value.name} was not auto-generated in Jira.`)
          errors.push(createSaltoElementError({
            message: `Field ${inst.value.name} was not auto-generates in Jira.`,
            severity: 'Error',
            elemID: inst.elemID,
          }))
          return
        }
        await deployField(change, client, config)
      },
    )

    return {
      leftoverChanges,
      deployResult: { appliedChanges: deployResult.appliedChanges, errors: [...deployResult.errors, ...errors] },
    }
  },
})

export default filter
