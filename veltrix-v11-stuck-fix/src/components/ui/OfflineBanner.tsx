import { motion, AnimatePresence } from 'framer-motion'
import { WifiOff } from 'lucide-react'
import { useOnline } from '@/hooks/useOnline'

/**
 * A single honest line when the device loses connectivity, so a failed
 * send reads as "no internet" rather than "the app is broken".
 */
export function OfflineBanner() {
  const online = useOnline()

  return (
    <AnimatePresence>
      {!online && (
        <motion.div
          role="status"
          aria-live="polite"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          style={{
            position: 'fixed',
            top: 'calc(var(--safe-top) + 8px)',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 90,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '9px 14px',
            borderRadius: 'var(--r-pill)',
            background: 'var(--danger)',
            color: '#fff',
            fontSize: 'var(--fs-label)',
            fontWeight: 540,
            boxShadow: 'var(--shadow-md)',
          }}
        >
          <WifiOff size={15} />
          Internet aloqasi uzildi
        </motion.div>
      )}
    </AnimatePresence>
  )
}
