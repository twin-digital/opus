const pkg = require('../../../package.json') as { version: string | undefined }

export const getPackageVersion = () => pkg.version
