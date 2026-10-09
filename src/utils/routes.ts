import { platform } from '../platform'

/** The presentations list. On the website `/` is the landing page. */
export const HOME = platform.kind === 'web' ? '/app' : '/'
