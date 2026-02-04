import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pwd = require('../password-config.cjs');
export default pwd;