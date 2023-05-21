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

import { DependencyChange, DependencyChanger, InstanceElement, ModificationChange, dependencyChange, getChangeData, isInstanceChange, isModificationChange } from '@salto-io/adapter-api'
import _ from 'lodash'
import { getParent } from '@salto-io/adapter-utils'
import { deployment } from '@salto-io/adapter-components'
import { APPLICATION_TYPE_NAME, APP_USER_SCHEMA_TYPE_NAME } from '../constants'
import { isActivationChange } from '../deployment'

type ChangeWithKey = deployment.dependency.ChangeWithKey<ModificationChange<InstanceElement>>

const createDependencyChange = (
  appUserSchemaChange: ChangeWithKey,
  appChange: ChangeWithKey | undefined
): DependencyChange[] => {
  if (appChange === undefined || !isActivationChange(
    { before: appChange.change.data.before.value.status,
      after: appChange.change.data.after.value.status }
  )) {
    return []
  }
  return [
    dependencyChange('add', appUserSchemaChange.key, appChange.key),
    dependencyChange('remove', appChange.key, appUserSchemaChange.key)]
}

/*
* This dependency changer is used to replace the dependency from appUserSchema to app
* because appUserSchema cannot be deployed with inactive app.
* If the app status is been modified to active we want the app to be deployed before the appUserSchema
*/
export const changeDependenciesFromAppUserSchemaToApp: DependencyChanger = async changes => {
  const instanceChanges = Array.from(changes.entries())
    .map(([key, change]) => ({ key, change }))
    .filter(({ change }) => isModificationChange(change))
    .filter(
      (change): change is ChangeWithKey =>
        isInstanceChange(change.change)
    )

  const [appUserSchemasChanges, appsChanges] = _.partition(
    instanceChanges
      .filter(change => [APP_USER_SCHEMA_TYPE_NAME, APPLICATION_TYPE_NAME]
        .includes(getChangeData(change.change).elemID.typeName)),
    change =>
      getChangeData(change.change).elemID.typeName === APP_USER_SCHEMA_TYPE_NAME
  )

  if (_.isEmpty(appUserSchemasChanges) || _.isEmpty(appsChanges)) {
    return []
  }

  const appChangeByApp = Object.fromEntries(appsChanges.map(appChange =>
    [getChangeData(appChange.change).elemID.getFullName(), appChange]))

  return appUserSchemasChanges.flatMap(change => {
    const app = getParent(getChangeData(change.change))
    const appChange = appChangeByApp[app.elemID.getFullName()]
    return createDependencyChange(change, appChange)
  })
}
