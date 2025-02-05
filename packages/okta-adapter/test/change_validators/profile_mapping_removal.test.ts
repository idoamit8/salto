/*
 * Copyright 2025 Salto Labs Ltd.
 * Licensed under the Salto Terms of Use (the "License");
 * You may not use this file except in compliance with the License.  You may obtain a copy of the License at https://www.salto.io/terms-of-use
 *
 * CERTAIN THIRD PARTY SOFTWARE MAY BE CONTAINED IN PORTIONS OF THE SOFTWARE. See NOTICE FILE AT https://github.com/salto-io/salto/blob/main/NOTICES
 */
import { toChange, ObjectType, ElemID, InstanceElement, ReferenceExpression } from '@salto-io/adapter-api'
import { profileMappingRemovalValidator } from '../../src/change_validators/profile_mapping_removal'
import {
  OKTA,
  APPLICATION_TYPE_NAME,
  IDENTITY_PROVIDER_TYPE_NAME,
  PROFILE_MAPPING_TYPE_NAME,
  USERTYPE_TYPE_NAME,
} from '../../src/constants'

describe('profileMappingRemovalValidator', () => {
  const appType = new ObjectType({ elemID: new ElemID(OKTA, APPLICATION_TYPE_NAME) })
  const identityProviderType = new ObjectType({ elemID: new ElemID(OKTA, IDENTITY_PROVIDER_TYPE_NAME) })
  const profileMappingType = new ObjectType({ elemID: new ElemID(OKTA, PROFILE_MAPPING_TYPE_NAME) })
  const userTypeType = new ObjectType({ elemID: new ElemID(OKTA, USERTYPE_TYPE_NAME) })

  const app = new InstanceElement('app', appType, { name: 'A', default: false })
  const identityProvider = new InstanceElement('idp', identityProviderType, { name: 'B', default: false })
  const userType = new InstanceElement('user type', userTypeType, { name: 'C', default: false })

  const profileMappingA = new InstanceElement('mappingA', profileMappingType, {
    source: { id: new ReferenceExpression(app.elemID, app) },
    target: { id: new ReferenceExpression(userType.elemID, userType) },
  })

  const profileMappingB = new InstanceElement('mappingB', profileMappingType, {
    source: { id: new ReferenceExpression(userType.elemID, userType) },
    target: { id: new ReferenceExpression(identityProvider.elemID, identityProvider) },
  })

  it('should return an error when ProfileMapping is deleted without its source or target Application', async () => {
    const changeErrors = await profileMappingRemovalValidator([
      toChange({ before: profileMappingA }),
      toChange({ before: profileMappingB }),
    ])
    expect(changeErrors).toHaveLength(2)
    expect(changeErrors).toEqual([
      {
        elemID: profileMappingA.elemID,
        severity: 'Error',
        message: 'Cannot remove profile mapping if neither its source nor target are also removed',
        detailedMessage:
          'In order to remove this Profile Mapping, remove its source (Application app) or target (UserType user type) as well.',
      },
      {
        elemID: profileMappingB.elemID,
        severity: 'Error',
        message: 'Cannot remove profile mapping if neither its source nor target are also removed',
        detailedMessage:
          'In order to remove this Profile Mapping, remove its source (UserType user type) or target (IdentityProvider idp) as well.',
      },
    ])
  })
  it('should not return an error when ProfileMapping is deleted with its source', async () => {
    const changeErrors = await profileMappingRemovalValidator([
      toChange({ before: profileMappingA }),
      toChange({ before: app }),
    ])
    expect(changeErrors).toHaveLength(0)
  })
  it('should not return an error when ProfileMapping is deleted with its target', async () => {
    const changeErrors = await profileMappingRemovalValidator([
      toChange({ before: profileMappingA }),
      toChange({ before: userType }),
    ])
    expect(changeErrors).toHaveLength(0)
  })
})
