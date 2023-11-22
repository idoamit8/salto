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
import { filterUtils } from '@salto-io/adapter-components'
import _ from 'lodash'
import { InstanceElement, ReferenceExpression, Element, CORE_ANNOTATIONS } from '@salto-io/adapter-api'
import { RECORDS_PATH } from '@salto-io/adapter-components/src/elements'
import { pathNaclCase } from '@salto-io/adapter-utils'
import { getDefaultConfig } from '../../../src/config/config'
import addAttributesAsFieldsFilter from '../../../src/filters/assets/change_attributes_path'
import { createEmptyType, getFilterParams } from '../../utils'
import { ASSESTS_SCHEMA_TYPE, ASSETS_ATTRIBUTE_TYPE, ASSETS_OBJECT_TYPE, JIRA } from '../../../src/constants'

describe('AddAttributesAsFields', () => {
    type FilterType = filterUtils.FilterWith<'onFetch'>
    let filter: FilterType
    let elements: Element[]
    let parentInstance: InstanceElement
    let sonOneInstance: InstanceElement
    let attributeInstance: InstanceElement
    let attributeInstance2: InstanceElement
    const assetSchemaInstance = new InstanceElement(
      'assetsSchema1',
      createEmptyType(ASSESTS_SCHEMA_TYPE),
      {
        idAsInt: 5,
        name: 'assetsSchema',
      },
    )
    describe('on fetch', () => {
      beforeEach(async () => {
        const config = _.cloneDeep(getDefaultConfig({ isDataCenter: false }))
        config.fetch.enableJSM = true
        config.fetch.enableJsmExperimental = true
        filter = addAttributesAsFieldsFilter(getFilterParams({ config })) as typeof filter
        parentInstance = new InstanceElement(
          'parentInstance',
          createEmptyType(ASSETS_OBJECT_TYPE),
          {
            name: 'parentInstance',
          },
          [JIRA, RECORDS_PATH, ASSESTS_SCHEMA_TYPE, assetSchemaInstance.elemID.name, 'assetsObjectTypes', 'parentInstance', 'parentInstance'],
          {
            [CORE_ANNOTATIONS.PARENT]: [new ReferenceExpression(assetSchemaInstance.elemID, assetSchemaInstance)],
          }
        )
        sonOneInstance = new InstanceElement(
          'sonOneInstance',
          createEmptyType(ASSETS_OBJECT_TYPE),
          {
            name: 'sonOneInstance',
            parentObjectTypeId: new ReferenceExpression(parentInstance.elemID, parentInstance),
          },
          [JIRA, RECORDS_PATH, ASSESTS_SCHEMA_TYPE, assetSchemaInstance.elemID.name, 'assetsObjectTypes', 'parentInstance', 'sonOneInstance', 'sonOneInstance'],
          {
            [CORE_ANNOTATIONS.PARENT]: [new ReferenceExpression(assetSchemaInstance.elemID, assetSchemaInstance)],
          },
        )
        attributeInstance = new InstanceElement(
          'attributeInstance',
          createEmptyType(ASSETS_ATTRIBUTE_TYPE),
          {
            name: 'attributeInstance',
            objectType: new ReferenceExpression(parentInstance.elemID, parentInstance),
          },
          undefined,
          {
            [CORE_ANNOTATIONS.PARENT]: [new ReferenceExpression(assetSchemaInstance.elemID, assetSchemaInstance)],
          },
        )
        attributeInstance2 = new InstanceElement(
          'attributeInstance2',
          createEmptyType(ASSETS_ATTRIBUTE_TYPE),
          {
            name: 'attributeInstance2',
            objectType: new ReferenceExpression(sonOneInstance.elemID, sonOneInstance),
          },
          undefined,
          {
            [CORE_ANNOTATIONS.PARENT]: [new ReferenceExpression(assetSchemaInstance.elemID, assetSchemaInstance)],
          },
        )
        elements = [
          parentInstance,
          sonOneInstance,
          assetSchemaInstance,
          attributeInstance,
          attributeInstance2,
        ]
      })
      it('should change each attribute path to the objectType that created it', async () => {
        await filter.onFetch(elements)
        expect(attributeInstance.path).toEqual([
          ...(parentInstance.path ?? []).slice(0, -1),
          'attributes',
          pathNaclCase(attributeInstance.value.name),
        ])
      })
    })
})
