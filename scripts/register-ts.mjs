import { register } from 'node:module'
import { pathToFileURL } from 'node:url'

register('./loader-ts.mjs', pathToFileURL(`${import.meta.dirname}/`))
