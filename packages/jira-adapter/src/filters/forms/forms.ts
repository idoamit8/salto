/*
 * Copyright 2025 Salto Labs Ltd.
 * Licensed under the Salto Terms of Use (the "License");
 * You may not use this file except in compliance with the License.  You may obtain a copy of the License at https://www.salto.io/terms-of-use
 *
 * CERTAIN THIRD PARTY SOFTWARE MAY BE CONTAINED IN PORTIONS OF THE SOFTWARE. See NOTICE FILE AT https://github.com/salto-io/salto/blob/main/NOTICES
 */

import {
  CORE_ANNOTATIONS,
  Change,
  InstanceElement,
  ReferenceExpression,
  SaltoError,
  SeverityLevel,
  Value,
  getChangeData,
  isAdditionChange,
  isAdditionOrModificationChange,
  isInstanceChange,
  isInstanceElement,
} from '@salto-io/adapter-api'
import { values as lowerDashValues } from '@salto-io/lowerdash'
import {
  getParent,
  inspectValue,
  invertNaclCase,
  mapKeysRecursive,
  naclCase,
  pathNaclCase,
  transformValuesSync,
} from '@salto-io/adapter-utils'
import _, { isPlainObject } from 'lodash'
import { logger } from '@salto-io/logging'
import { resolveValues } from '@salto-io/adapter-components'
import { FilterCreator } from '../../filter'
import { FORM_TYPE, JSM_DUCKTYPE_API_DEFINITIONS, PROJECT_TYPE, SERVICE_DESK } from '../../constants'
import { createFormType, isCreateFormResponse, isDetailedFormsResponse, isFormsResponse } from './forms_types'
import { deployChanges } from '../../deployment/standard_deployment'
import JiraClient from '../../client/client'
import { setTypeDeploymentAnnotations, addAnnotationRecursively } from '../../utils'
import { getLookUpName } from '../../reference_mapping'

const { isDefined } = lowerDashValues
const log = logger(module)

const isTransformedObject = (value: Value): boolean =>
  isPlainObject(value) && Object.keys(value).length > 0 && Object.keys(value).every(key => key === 'value' || key === 'key')

/* Since the reference infrastructure does not support lists within maps, we modify the form values structure. 
 * Update the structure here as necessary if needed. 
 */
const transformFormValues = (form: InstanceElement): void => {
  form.value = transformValuesSync({
    values: form.value,
    type: form.getTypeSync(),
    pathID: form.elemID,
    strict: false,
    allowEmptyArrays: true,
    allowEmptyObjects: true,
    transformFunc: ({ value, path }) => {
      if (
        path !== undefined &&
        !isTransformedObject(value) &&
        form.elemID.createNestedID('design', 'conditions').isParentOf(path) &&
        Object.values(value).some(Array.isArray)
      ) {
        const newValue = Object.entries(value).map(([key, val]) => ({ key, value: val }))
        return newValue
      }
      return value
    },
  })
}

const deployForms = async (change: Change<InstanceElement>, client: JiraClient): Promise<void> => {
  const form = getChangeData(change)
  const project = getParent(form)
  if (form.value.design?.settings?.name === undefined) {
    throw new Error('Form name is missing')
  }
  if (isAdditionOrModificationChange(change)) {
    const resolvedForm = await resolveValues(form, getLookUpName)
    const data = mapKeysRecursive(resolvedForm.value, ({ key }) => invertNaclCase(key))
    // RequestType Id is a string, but the forms API expects a number
    if (Array.isArray(data.publish?.portal?.portalRequestTypeIds)) {
      data.publish.portal.portalRequestTypeIds = data.publish.portal.portalRequestTypeIds.map((id: string) =>
        Number(id),
      )
    }
    if (isAdditionChange(change)) {
      const resp = await client.atlassianApiPost({
        url: `project/${project.value.id}/form`,
        data,
      })
      if (!isCreateFormResponse(resp.data)) {
        throw new Error('Failed to create form')
      }
      form.value.id = resp.data.id
    } else {
      await client.atlassianApiPut({
        url: `project/${project.value.id}/form/${form.value.id}`,
        data,
      })
    }
  } else {
    await client.atlassianApiDelete({
      url: `project/${project.value.id}/form/${form.value.id}`,
    })
  }
}

/*
 * This filter fetches all forms from Jira Service Management and creates an instance element for each form.
 * We use filter because we need to use cloudId which is not available in the infrastructure.
 */
const filter: FilterCreator = ({ config, client, fetchQuery }) => ({
  name: 'formsFilter',
  onFetch: async elements => {
    if (!config.fetch.enableJSM || client.isDataCenter || !fetchQuery.isTypeMatch(FORM_TYPE)) {
      return { errors: [] }
    }
    const { formType, subTypes } = createFormType()
    setTypeDeploymentAnnotations(formType)
    await addAnnotationRecursively(formType, CORE_ANNOTATIONS.CREATABLE)
    await addAnnotationRecursively(formType, CORE_ANNOTATIONS.UPDATABLE)
    await addAnnotationRecursively(formType, CORE_ANNOTATIONS.DELETABLE)
    elements.push(formType)
    subTypes.forEach(subType => {
      elements.push(subType)
    })

    const jsmProjects = elements
      .filter(isInstanceElement)
      .filter(instance => instance.elemID.typeName === PROJECT_TYPE)
      .filter(project => project.value.projectTypeKey === SERVICE_DESK)

    const errors: SaltoError[] = []
    const projectsWithoutForms: string[] = []
    const projectsWithUntitledForms: Set<string> = new Set()
    const formsEntries = await Promise.all(
      jsmProjects.map(async project => {
        try {
          const res = await client.atlassianApiGet({
            url: `project/${project.value.id}/form`,
          })
          if (!isFormsResponse(res)) {
            log.debug(
              `Didn't fetch forms for project ${project.value.name} with the following response: ${inspectValue(res)}`,
            )
            return { project, formsResponse: [], detailedFormsResponse: [] }
          }

          const detailedFormsResponse = await Promise.all(
            res.data.map(async formResponse => {
              const detailedRes = await client.atlassianApiGet({
                url: `project/${project.value.id}/form/${formResponse.id}`,
              })
              if (!isDetailedFormsResponse(detailedRes.data)) {
                projectsWithUntitledForms.add(project.elemID.name)
                return undefined
              }
              return detailedRes.data
            }),
          )
          if (detailedFormsResponse.filter(isDefined).length === 0) {
            return { project, formsResponse: [], detailedFormsResponse: [] }
          }

          return {
            project,
            formsResponse: res.data,
            detailedFormsResponse: detailedFormsResponse.filter(isDefined),
          }
        } catch (e) {
          log.error(
            `Failed to fetch forms for project ${project.value.name} with the following response: ${inspectValue(e)}`,
          )
          if (e.response?.status === 403) {
            projectsWithoutForms.push(project.elemID.name)
          }
          return { project, formsResponse: [], detailedFormsResponse: [] }
        }
      }),
    )

    const forms = (
      await Promise.all(
        formsEntries.flatMap(({ project, formsResponse, detailedFormsResponse }) => {
          const parentPath = project.path ?? []
          const jsmDuckTypeApiDefinitions = config[JSM_DUCKTYPE_API_DEFINITIONS]
          if (jsmDuckTypeApiDefinitions === undefined) {
            return []
          }

          return formsResponse.map((formResponse, index) => {
            const name = naclCase(`${project.value.key}_${formResponse.name}`)
            const formValue = detailedFormsResponse[index]
            return new InstanceElement(
              name,
              formType,
              formValue,
              [...parentPath.slice(0, -1), 'forms', pathNaclCase(name)],
              {
                [CORE_ANNOTATIONS.PARENT]: [new ReferenceExpression(project.elemID, project)],
              },
            )
          })
        }),
      )
    )
      .flat()
      .filter(isDefined)

    forms.forEach(form => {
      if (form.value.design?.conditions) {
        transformFormValues(form)
      }
      form.value = mapKeysRecursive(form.value, ({ key }) => naclCase(key))
      elements.push(form)
    })
    if (projectsWithoutForms.length > 0) {
      const message = `Unable to fetch forms for the following projects: ${projectsWithoutForms.join(', ')}. This issue is likely due to insufficient permissions.`
      log.debug(message)
      errors.push({
        message,
        detailedMessage: message,
        severity: 'Warning' as SeverityLevel,
      })
    }
    const projectsWithUntitledFormsArr = Array.from(projectsWithUntitledForms)
    if (projectsWithUntitledFormsArr.length > 0) {
      const message = `Salto does not support fetching untitled forms, found in the following projects: ${projectsWithUntitledFormsArr.join(', ')}`
      log.debug(message)
      errors.push({
        message,
        detailedMessage: message,
        severity: 'Warning' as SeverityLevel,
      })
    }

    return { errors }
  },
  preDeploy: async changes => {
    changes
      .filter(isInstanceChange)
      .map(change => getChangeData(change))
      .filter(instance => instance.elemID.typeName === FORM_TYPE)
      .forEach((instance: InstanceElement) => {
        instance.value.updated = new Date().toISOString()
        instance.value = transformValuesSync({
          values: instance.value,
          type: instance.getTypeSync(),
          pathID: instance.elemID,
          strict: false,
          allowEmptyArrays: true,
          allowEmptyObjects: true,
          transformFunc: ({ value, path }) => {
            if (path !== undefined && Array.isArray(value) && value.length > 0 && value.every(isTransformedObject)) {
              const originalValue = value.reduce((acc, { key, value: val }) => {
                acc[key] = val
                return acc
              }, {})
              return originalValue
            }
            return value
          },
        })
      })
  },
  deploy: async changes => {
    if (!config.fetch.enableJSM || client.isDataCenter) {
      return {
        deployResult: { appliedChanges: [], errors: [] },
        leftoverChanges: changes,
      }
    }
    const [formsChanges, leftoverChanges] = _.partition(
      changes,
      (change): change is Change<InstanceElement> =>
        isInstanceChange(change) && getChangeData(change).elemID.typeName === FORM_TYPE,
    )
    const deployResult = await deployChanges(formsChanges, async change => deployForms(change, client))

    return {
      leftoverChanges,
      deployResult,
    }
  },
  onDeploy: async changes => {
    changes
      .filter(isInstanceChange)
      .map(change => getChangeData(change))
      .filter(instance => instance.elemID.typeName === FORM_TYPE)
      .forEach((instance: InstanceElement) => {
        if (instance.value.design?.conditions) {
          transformFormValues(instance)
        }
        delete instance.value.updated
      })
  },
})
export default filter
