/** Absolute URL of a bundled runtime asset under public/vendor (works at any base path). */
export function vendorUrl(path: string): string {
  return new URL(`${import.meta.env.BASE_URL}vendor/${path}`, window.location.href).href
}
