import { getPackageSpecifications, PACKAGE_SPEC_SLUGS } from '@/lib/package-specifications'
import { VCS } from '@/views/vcs-current/a'

export default async function HomePage() {
  const packageSpecifications = await getPackageSpecifications()

  return <VCS packageSpecifications={packageSpecifications} />
}
