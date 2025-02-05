/*
 * Copyright 2025 Salto Labs Ltd.
 * Licensed under the Salto Terms of Use (the "License");
 * You may not use this file except in compliance with the License.  You may obtain a copy of the License at https://www.salto.io/terms-of-use
 *
 * CERTAIN THIRD PARTY SOFTWARE MAY BE CONTAINED IN PORTIONS OF THE SOFTWARE. See NOTICE FILE AT https://github.com/salto-io/salto/blob/main/NOTICES
 */

import {
  BuiltinTypes,
  ConfigCreator,
  CORE_ANNOTATIONS,
  createRestriction,
  ElemID,
  InstanceElement,
  ListType,
} from '@salto-io/adapter-api'
import {
  createDefaultInstanceFromType,
  createMatchingObjectType,
  createOptionsTypeGuard,
} from '@salto-io/adapter-utils'
import { configType } from './types'
import * as constants from './constants'
import { CPQ_NAMESPACE, CUSTOM_OBJECT_ID_FIELD } from './constants'

export const configWithCPQ = new InstanceElement(ElemID.CONFIG_NAME, configType, {
  fetch: {
    metadata: {
      include: [
        {
          metadataType: '.*',
          namespace: '',
          name: '.*',
        },
        {
          metadataType: '.*',
          namespace: CPQ_NAMESPACE,
          name: '.*',
        },
        {
          metadataType: '.*',
          namespace: 'sbaa',
          name: '.*',
        },
      ],
      exclude: [
        {
          metadataType: 'Report',
        },
        {
          metadataType: 'ReportType',
        },
        {
          metadataType: 'ReportFolder',
        },
        {
          metadataType: 'Dashboard',
        },
        {
          metadataType: 'DashboardFolder',
        },
        {
          metadataType: 'Document',
        },
        {
          metadataType: 'DocumentFolder',
        },
        {
          metadataType: 'Profile',
        },
        {
          metadataType: 'PermissionSet',
        },
        {
          metadataType: 'MutingPermissionSet',
        },
        {
          metadataType: 'PermissionSetGroup',
        },
        {
          metadataType: 'SiteDotCom',
        },
        {
          metadataType: 'EmailTemplate',
          name: 'Marketo_?Email_?Templates/.*',
        },
        {
          metadataType: 'ContentAsset',
        },
        {
          metadataType: 'CustomObjectTranslation',
        },
        {
          metadataType: 'AnalyticSnapshot',
        },
        {
          metadataType: 'WaveDashboard',
        },
        {
          metadataType: 'WaveDataflow',
        },
        {
          metadataType: 'StandardValueSet',
          name: '^(AddressCountryCode)|(AddressStateCode)$',
          namespace: '',
        },
        {
          metadataType: 'Layout',
          name: 'CollaborationGroup-Group Layout',
        },
        {
          metadataType: 'Layout',
          name: 'CaseInteraction-Case Feed Layout',
        },
        {
          metadataType: 'EclairGeoData',
        },
        {
          metadataType:
            'OmniUiCard|OmniDataTransform|OmniIntegrationProcedure|OmniInteractionAccessConfig|OmniInteractionConfig|OmniScript',
        },
        {
          metadataType: 'DiscoveryAIModel',
        },
        {
          metadataType: 'Translations',
        },
        {
          metadataType: 'ManagedEventSubscription',
        },
      ],
    },
    data: {
      includeObjects: [
        'SBQQ__.*',
        'sbaa__ApprovalChain__c',
        'sbaa__ApprovalCondition__c',
        'sbaa__ApprovalRule__c',
        'sbaa__ApprovalVariable__c',
        'sbaa__Approver__c',
        'sbaa__EmailTemplate__c',
        'sbaa__TrackedField__c',
      ],
      excludeObjects: [
        'SBQQ__ContractedPrice__c',
        'SBQQ__Quote__c',
        'SBQQ__QuoteDocument__c',
        'SBQQ__QuoteLine__c',
        'SBQQ__QuoteLineGroup__c',
        'SBQQ__Subscription__c',
        'SBQQ__SubscribedAsset__c',
        'SBQQ__SubscribedQuoteLine__c',
        'SBQQ__SubscriptionConsumptionRate__c',
        'SBQQ__SubscriptionConsumptionSchedule__c',
        'SBQQ__WebQuote__c',
        'SBQQ__WebQuoteLine__c',
        'SBQQ__QuoteLineConsumptionSchedule__c',
        'SBQQ__QuoteLineConsumptionRate__c',
        'SBQQ__InstallProcessorLog__c',
        'SBQQ__ProcessInputValue__c',
        'SBQQ__RecordJob__c',
        'SBQQ__TimingLog__c',
      ],
      allowReferenceTo: ['Product2', 'Pricebook2', 'PricebookEntry'],
      saltoIDSettings: {
        defaultIdFields: [CUSTOM_OBJECT_ID_FIELD],
      },
      brokenOutgoingReferencesSettings: {
        defaultBehavior: 'BrokenReference',
        perTargetTypeOverrides: {
          User: 'InternalId',
        },
      },
    },
  },
  maxItemsInRetrieveRequest: 2500,
})

const optionsElemId = new ElemID(constants.SALESFORCE, 'configOptionsType')

const CPQ_MANAGED_PACKAGE = 'sbaa, SBQQ (CPQ)'

const MANAGED_PACKAGES = [CPQ_MANAGED_PACKAGE] as const

type ManagedPackage = (typeof MANAGED_PACKAGES)[number]

export type SalesforceConfigOptionsType = {
  cpq?: boolean
  managedPackages?: ManagedPackage[]
}

export const optionsType = createMatchingObjectType<SalesforceConfigOptionsType>({
  elemID: optionsElemId,
  fields: {
    cpq: { refType: BuiltinTypes.BOOLEAN },
    managedPackages: {
      refType: new ListType(BuiltinTypes.STRING),
      annotations: {
        [CORE_ANNOTATIONS.RESTRICTION]: createRestriction({
          values: MANAGED_PACKAGES,
          enforce_value: true,
        }),
        [CORE_ANNOTATIONS.DESCRIPTION]:
          'Names of managed packages to fetch into the environment [Learn more](https://help.salto.io/en/articles/9164974-extending-your-salesforce-configuration-with-managed-packages)',
      },
    },
  },
})

export const getConfig = async (options?: InstanceElement): Promise<InstanceElement> => {
  const defaultConf = await createDefaultInstanceFromType(ElemID.CONFIG_NAME, configType)
  if (options === undefined || !createOptionsTypeGuard<SalesforceConfigOptionsType>(optionsElemId)(options)) {
    return defaultConf
  }
  if (options.value.cpq === true || options.value.managedPackages?.includes(CPQ_MANAGED_PACKAGE)) {
    return configWithCPQ
  }
  return defaultConf
}

export const configCreator: ConfigCreator = {
  optionsType,
  getConfig,
}
