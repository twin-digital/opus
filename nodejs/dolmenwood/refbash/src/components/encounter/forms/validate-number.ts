import isEmpty from 'lodash-es/isEmpty.js'
import isNaN from 'lodash-es/isNaN.js'

export const validateNumber = (value: string) => (!isEmpty(value) && !isNaN(Number(value)) ? null : 'must be a number')
