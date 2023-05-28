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

import { ElemID, BuiltinTypes, CORE_ANNOTATIONS, ObjectType, InstanceElement, ReferenceExpression, StaticFile } from '@salto-io/adapter-api'
import { TYPES_PATH, SUBTYPES_PATH } from '@salto-io/adapter-components/src/elements'
import OktaClient from '../../src/client/client'
import { APPLICATION_TYPE_NAME, APP_LOGO_TYPE_NAME, BRAND_LOGO_TYPE_NAME, BRAND_THEME_TYPE_NAME, BRAND_TYPE_NAME, LINKS_FIELD, OKTA } from '../../src/constants'
import { createLogoType, getLogo } from '../../src/filters/logo'
import { mockClient } from '../utils'

describe('logo filter', () => {
  const content = Buffer.from('test')
  let mockGet: jest.SpyInstance
  let client: OktaClient
  const appType = new ObjectType({ elemID: new ElemID(OKTA, APPLICATION_TYPE_NAME) })
  const brandThemeType = new ObjectType({ elemID: new ElemID(OKTA, BRAND_THEME_TYPE_NAME) })
  const brandType = new ObjectType({ elemID: new ElemID(OKTA, BRAND_TYPE_NAME) })
  const brandLogoType = new ObjectType({ elemID: new ElemID(OKTA, BRAND_LOGO_TYPE_NAME) })
  const brandInstance = new InstanceElement(
    'brand1',
    brandType,
    {
      id: '9',
      name: 'brand1',
    },
  )
  const brandThemeInstance = new InstanceElement(
    'brandTheme1',
    brandThemeType,
    {
      id: '11',
      logo: 'https://ok12static.oktacdn.com/bc/image/111',
    },
    undefined,
    {
      [CORE_ANNOTATIONS.PARENT]: [new ReferenceExpression(brandInstance.elemID, brandInstance)],
    }
  )
  const appInstance = new InstanceElement(
    'app1',
    appType,
    {
      id: '11',
      label: 'app1',
      [LINKS_FIELD]: {
        logo: [
          {
            name: 'fileName',
            href: 'https://ok12static.oktacdn.com/fs/bco/4/111',
            type: 'image/png',
          },
        ],
      },
    }
  )
  const contentType = 'png'
  const fileName = 'app1'
  const link = 'https://ok12static.oktacdn.com/fs/bco/4/111'
  const appLogoType = new ObjectType({ elemID: new ElemID(OKTA, APP_LOGO_TYPE_NAME) })
  describe('cretaeLogoType', () => {
    it('should create logo type', () => {
      const logoType = createLogoType(APP_LOGO_TYPE_NAME)
      expect(logoType.elemID.name).toEqual(APP_LOGO_TYPE_NAME)
      expect(logoType).toEqual(new ObjectType({
        elemID: new ElemID(OKTA, APP_LOGO_TYPE_NAME),
        fields: {
          id: {
            refType: BuiltinTypes.STRING,
            annotations: { [CORE_ANNOTATIONS.HIDDEN_VALUE]: true },
          },
          content: { refType: BuiltinTypes.STRING },
          contentType: { refType: BuiltinTypes.STRING },
          fileName: { refType: BuiltinTypes.STRING },
        },
        path: [OKTA, TYPES_PATH, SUBTYPES_PATH, APP_LOGO_TYPE_NAME, APP_LOGO_TYPE_NAME],
      }))
    })
  })
  describe('getLogo', () => {
    beforeEach(async () => {
      const mockCli = mockClient()
      client = mockCli.client
      mockGet = jest.spyOn(client, 'getResource')
      mockGet.mockImplementation(params => {
        if (params.url === 'https://ok12static.oktacdn.com/fs/bco/4/111') {
          return {
            status: 200,
            data: content,
          }
        }
        throw new Error('Err')
      })
    })
    it('should return logo', async () => {
      const logo = await getLogo({ client,
        parents: [appInstance],
        logoType: appLogoType,
        contentType,
        logoName: fileName,
        link })
      expect(logo?.value).toEqual({
        id: '111',
        fileName: `${fileName}.${contentType}`,
        contentType,
        content: new StaticFile({
          filepath: 'okta/AppLogo/app1.png', encoding: 'binary', content,
        }),
      })
      expect(logo?.annotations[CORE_ANNOTATIONS.PARENT]).toHaveLength(1)
      expect(logo?.annotations[CORE_ANNOTATIONS.PARENT])
        .toContainEqual(new ReferenceExpression(appInstance.elemID, appInstance))
    })
    it('should return undefined when no logo', async () => {
      const clonedBradTheme = brandThemeInstance.clone()
      clonedBradTheme.value.logo = undefined
      const logo = await getLogo({ client,
        parents: [clonedBradTheme, brandInstance],
        logoType: brandLogoType,
        contentType })
      expect(logo).toBeUndefined()
    })
  })
})
