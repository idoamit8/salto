/*
 * Copyright 2025 Salto Labs Ltd.
 * Licensed under the Salto Terms of Use (the "License");
 * You may not use this file except in compliance with the License.  You may obtain a copy of the License at https://www.salto.io/terms-of-use
 *
 * CERTAIN THIRD PARTY SOFTWARE MAY BE CONTAINED IN PORTIONS OF THE SOFTWARE. See NOTICE FILE AT https://github.com/salto-io/salto/blob/main/NOTICES
 */
import {
  ChangeValidator,
  ElemID,
  getChangeData,
  ChangeError,
  isAdditionOrModificationChange,
  InstanceElement,
} from '@salto-io/adapter-api'
import { isInstanceOfCustomObjectChangeSync } from '../filters/utils'

const createDataDeploymentChangeInfo = (instanceElemID: ElemID): ChangeError => ({
  elemID: instanceElemID,
  severity: 'Info',
  message: 'Data instances will be changed in deployment.',
  detailedMessage: '',
})

const getMissingFields = (instance: InstanceElement): string[] => {
  const typeFields = new Set(Object.keys(instance.getTypeSync().fields))
  return Object.keys(instance.value).filter(fieldName => !typeFields.has(fieldName))
}

const createMissingFieldsValuesChangeError = (instance: InstanceElement, missingFields: string[]): ChangeError => ({
  elemID: instance.elemID,
  severity: 'Warning',
  message: 'Data instance has values of unknown fields',
  detailedMessage: `Some fields do not exist in the target environment, therefore their values will be omitted from the deployment. Missing fields: [${missingFields.join(', ')}].`,
})

const createDataChangeValidator: ChangeValidator = async changes => {
  const changeErrors: ChangeError[] = []
  const dataChanges = changes.filter(isInstanceOfCustomObjectChangeSync)

  if (dataChanges.length === 0) {
    return []
  }
  changeErrors.push(createDataDeploymentChangeInfo(getChangeData(dataChanges[0]).elemID))
  dataChanges
    // Deletions should work even if some values are missing on the type
    .filter(isAdditionOrModificationChange)
    .map(getChangeData)
    .map(instance => ({
      instance,
      missingFields: getMissingFields(instance),
    }))
    .filter(({ missingFields }) => missingFields.length > 0)
    .forEach(({ instance, missingFields }) =>
      changeErrors.push(createMissingFieldsValuesChangeError(instance, missingFields)),
    )
  return changeErrors
}

export default createDataChangeValidator
