import styles from './PxLandingPage.module.css'

/**
 * An intentionally transparent chapter: the app-level Saga canvas sits behind
 * it, while all other PX chapters use opaque light surfaces.
 */
export function PxSagaBanner({ children }: { children: React.ReactNode }) {
  return (
    <section className={styles.sagaBanner} data-header-theme="light" aria-label="PX creative canvas">
      <div className={`${styles.sagaBannerFrame} mx-auto flex max-w-[1440px] flex-col justify-between px-20 py-32 md:px-40 md:py-40 cursor-default`}>
        {/* <p className="px-mono text-xs uppercase">PX / persistent creative context</p> */}
        {children}
      </div>
    </section>
  )
}
