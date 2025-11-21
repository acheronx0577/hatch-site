import { useEffect, useState } from 'react'

export const usePageAnimations = () => {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false)

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    setPrefersReducedMotion(mediaQuery.matches)
    
    const handleChange = (e: MediaQueryListEvent) => {
      setPrefersReducedMotion(e.matches)
    }
    
    mediaQuery.addEventListener('change', handleChange)
    return () => mediaQuery.removeEventListener('change', handleChange)
  }, [])

  // Animation variants
  const pageVariants = {
    headerVariant: {
      hidden: { opacity: 0, y: -20 },
      visible: {
        opacity: 1,
        y: 0,
        transition: { duration: 0.5 }
      }
    },

    searchVariant: {
      hidden: { opacity: 0, x: -20 },
      visible: {
        opacity: 1,
        x: 0,
        transition: { delay: 0.2, duration: 0.4 }
      }
    },

    contentVariant: {
      hidden: { opacity: 0, y: 20 },
      visible: {
        opacity: 1,
        y: 0,
        transition: { delay: 0.3, duration: 0.4 }
      }
    },

    cardVariant: {
      hidden: { opacity: 0, y: 20 },
      visible: (index: number) => ({
        opacity: 1,
        y: 0,
        transition: {
          delay: index * 0.05,
          duration: 0.3,
        }
      })
    },

    staggerContainer: {
      hidden: { opacity: 0 },
      visible: {
        opacity: 1,
        transition: {
          staggerChildren: 0.1
        }
      }
    },

    fadeInUp: {
      hidden: { opacity: 0, y: 20 },
      visible: {
        opacity: 1,
        y: 0,
        transition: { duration: 0.4 }
      }
    },

    emptyStateVariant: {
      hidden: { opacity: 0, scale: 0.9 },
      visible: {
        opacity: 1,
        scale: 1,
        transition: { delay: 0.3, duration: 0.5 }
      }
    }
  }

  const buttonHoverVariant = prefersReducedMotion ? {} : {
    whileHover: { scale: 1.05, y: -2, transition: { duration: 0.2 } },
    whileTap: { scale: 0.95 }
  }

  const cardHoverVariant = prefersReducedMotion ? {} : {
    whileHover: { y: -8, transition: { duration: 0.2 } }
  }

  const scaleHoverVariant = prefersReducedMotion ? {} : {
    whileHover: { scale: 1.02, y: -5, transition: { duration: 0.2 } }
  }

  const getInitialState = (variantName: keyof typeof pageVariants) => {
    return prefersReducedMotion ? "visible" : "hidden"
  }

  return {
    prefersReducedMotion,
    pageVariants,
    buttonHoverVariant,
    cardHoverVariant,
    scaleHoverVariant,
    getInitialState
  }
}
