/*
 * Copyright 2025 Salto Labs Ltd.
 * Licensed under the Salto Terms of Use (the "License");
 * You may not use this file except in compliance with the License.  You may obtain a copy of the License at https://www.salto.io/terms-of-use
 *
 * CERTAIN THIRD PARTY SOFTWARE MAY BE CONTAINED IN PORTIONS OF THE SOFTWARE. See NOTICE FILE AT https://github.com/salto-io/salto/blob/main/NOTICES
 */
import { ElemID, InstanceElement, ObjectType } from '@salto-io/adapter-api'
import { configType } from '../src/types'
import { optionsType, configWithCPQ, getConfig, SalesforceConfigOptionsType } from '../src/config_creator'

const mockDefaultInstanceFromTypeResult = new InstanceElement('mock name', configType)
const mockCreateDefaultInstanceFromType = jest.fn().mockResolvedValue(mockDefaultInstanceFromTypeResult)

jest.mock('@salto-io/adapter-utils', () => ({
  ...jest.requireActual<{}>('@salto-io/adapter-utils'),
  createDefaultInstanceFromType: jest.fn().mockImplementation((...args) => mockCreateDefaultInstanceFromType(...args)),
}))

const mockLogError = jest.fn()
jest.mock('@salto-io/logging', () => ({
  ...jest.requireActual<{}>('@salto-io/logging'),
  logger: jest.fn().mockReturnValue({
    debug: jest.fn(),
    info: jest.fn(),
    error: jest.fn((...args) => mockLogError(...args)),
  }),
}))

describe('config_creator', () => {
  let options: InstanceElement | undefined
  let resultConfig: InstanceElement

  const createMockOptionsInstance = (value: SalesforceConfigOptionsType): InstanceElement =>
    new InstanceElement('options', optionsType, value)

  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('when input contains cpq equal true', () => {
    beforeEach(async () => {
      options = createMockOptionsInstance({ cpq: true })
      resultConfig = await getConfig(options)
    })
    it('should return adapter config with cpq', async () => {
      expect(resultConfig).toEqual(configWithCPQ)
      expect(mockLogError).not.toHaveBeenCalled()
    })
  })

  describe('when input contains managed packages', () => {
    describe('when managed packages include CPQ', () => {
      it('should return adapter config with cpq', async () => {
        options = createMockOptionsInstance({
          managedPackages: ['sbaa, SBQQ (CPQ)'],
        })
        expect(await getConfig(options)).toEqual(configWithCPQ)
        expect(mockLogError).not.toHaveBeenCalled()
      })
    })
  })

  describe('when input contains cpq equal false', () => {
    beforeEach(async () => {
      options = createMockOptionsInstance({ cpq: false })
      resultConfig = await getConfig(options)
    })
    it('should create default instance from type', async () => {
      expect(mockCreateDefaultInstanceFromType).toHaveBeenCalledWith(ElemID.CONFIG_NAME, configType)
      expect(resultConfig).toEqual(mockDefaultInstanceFromTypeResult)
      expect(mockLogError).not.toHaveBeenCalled()
    })
  })

  describe('when input does not contain cpq', () => {
    beforeEach(async () => {
      options = createMockOptionsInstance({})
      resultConfig = await getConfig(options)
    })
    it('should create default instance from type', async () => {
      expect(mockCreateDefaultInstanceFromType).toHaveBeenCalledWith(ElemID.CONFIG_NAME, configType)
      expect(resultConfig).toEqual(mockDefaultInstanceFromTypeResult)
      expect(mockLogError).not.toHaveBeenCalled()
    })
  })

  describe('when input is not a valid optionsType', () => {
    beforeEach(async () => {
      const differentObjType = new ObjectType({
        elemID: new ElemID('mock'),
      })
      options = new InstanceElement('options', differentObjType, { cpq: true })
      resultConfig = await getConfig(options)
    })
    it('should create default instance from type and log error', async () => {
      expect(mockCreateDefaultInstanceFromType).toHaveBeenCalledWith(ElemID.CONFIG_NAME, configType)
      expect(resultConfig).toEqual(mockDefaultInstanceFromTypeResult)
      expect(mockLogError).toHaveBeenCalledWith(
        `Received an invalid instance for config options. Received instance with refType ElemId full name: ${options?.refType.elemID.getFullName()}`,
      )
    })
  })
})
