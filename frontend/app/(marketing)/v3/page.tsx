import { getPackageSpecifications } from '@/sanity/lib/package-specifications'
import { VCS } from '@/views/vcs3'

export default async function V3Page() {
  const packageSpecifications = await getPackageSpecifications()

  return <VCS packageSpecifications={packageSpecifications} />
}
