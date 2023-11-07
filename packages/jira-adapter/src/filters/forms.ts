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

import { Change, ChangeDataType, InstanceElement, getChangeData, isAdditionChange, isAdditionOrModificationChange, isInstanceChange, isInstanceElement } from '@salto-io/adapter-api'
import { createSchemeGuard, getParent } from '@salto-io/adapter-utils'
import _ from 'lodash'
import Joi from 'joi'
import { FilterCreator } from '../filter'
import { FORM_TYPE_NAME } from '../constants'
import { getCloudId } from './automation/cloud_id'
import { deployChanges } from '../deployment/standard_deployment'
import JiraClient from '../client/client'

type createFormResponse = {
  id: number
}
const CREATE_FORM_RESPONSE_SCHEME = Joi.object({
  id: Joi.number().required(),
}).unknown(true).required()
const isCreateFormResponse = createSchemeGuard<createFormResponse>(CREATE_FORM_RESPONSE_SCHEME)

const deployForms = async (
  change: Change<InstanceElement>,
  client: JiraClient,
): Promise<void> => {
  const form = getChangeData(change)
  const project = getParent(form)
  if (form.value.formDetails.design.settings.name === undefined) {
    throw new Error('Form name is missing')
  }
  const { formDetails } = form.value
  const cloudId = await getCloudId(client)
  if (isAdditionOrModificationChange(change)) {
    if (isAdditionChange(change)) {
      const resp = await client.post({
        url: `/gateway/api/proforma/cloudid/${cloudId}/api/2/projects/${project.value.id}/forms`,
        data: {
          name: form.value.name,
        },
      })
      if (!isCreateFormResponse(resp.data)) {
        return
      }
      form.value.id = resp.data.id
      form.value.formDetails.design.settings.templateId = resp.data.id
    }
    await client.put({
      url: `/gateway/api/proforma/cloudid/${cloudId}/api/2/projects/${project.value.id}/forms/${form.value.id}`,
      data: formDetails,
    })
  } else {
    await client.delete({
      url: `/gateway/api/proforma/cloudid/${cloudId}/api/1/projects/${project.value.id}/forms/${form.value.id}`,
    })
  }
}

/*
* This filter fetches all forms from Jira Service Management and creates an instance element for each form.
* We use filter because we need to use cloudId which is not available in the infrastructure.
*/
const filter: FilterCreator = ({ config, client }) => ({
  name: 'formsFilter',
  onFetch: async elements => {
    elements.filter(isInstanceElement).filter(e => e.elemID.typeName === FORM_TYPE_NAME).forEach(form => {
      [form.value.formDetails] = form.value.formDetails
    })
  },
  preDeploy: async (changes: Change<ChangeDataType>[]) => {
    const filedNames = ['conditions', 'sections', 'questions']
    changes
      .filter(isInstanceChange)
      .filter(isAdditionOrModificationChange)
      .filter(change => getChangeData(change).elemID.typeName === FORM_TYPE_NAME)
      .map(change => getChangeData(change))
      .forEach(instance => {
        filedNames.forEach(fieldName => {
          if (instance.value.formDetails.design[fieldName] === undefined) {
            instance.value.formDetails.design[fieldName] = {}
          }
        })
      })
  },
  deploy: async changes => {
    if (!config.fetch.enableJSM || !config.fetch.enableJsmExperimental) {
      return {
        deployResult: { appliedChanges: [], errors: [] },
        leftoverChanges: changes,
      }
    }
    const [formsChanges, leftoverChanges] = _.partition(
      changes,
      (change): change is Change<InstanceElement> => isInstanceChange(change)
      && getChangeData(change).elemID.typeName === FORM_TYPE_NAME
    )
    const deployResult = await deployChanges(formsChanges,
      async change => deployForms(change, client))

    return {
      leftoverChanges,
      deployResult,
    }
  },
  onDeploy: async (changes: Change<ChangeDataType>[]) => {
    const filedNames = ['conditions', 'sections', 'questions']
    changes
      .filter(isInstanceChange)
      .filter(isAdditionOrModificationChange)
      .filter(change => getChangeData(change).elemID.typeName === FORM_TYPE_NAME)
      .map(change => getChangeData(change))
      .forEach(instance => {
        filedNames.forEach(fieldName => {
          if (_.isEmpty(instance.value.formDetails.design[fieldName])) {
            delete instance.value.formDetails.design[fieldName]
          }
        })
      })
  },
})
export default filter
