/**
 * FRVV Logo component — Federația Română de Vovinam Viet-Vo-Dao
 * 
 * Usage:
 *   import Logo from '@shared/components/Logo';
 *   <Logo size={48} />          // 48px square
 *   <Logo className="h-10" />   // Tailwind sizing
 * 
 * The logo file (frvv-logo.png) should be placed in each app's `public/` folder.
 */
export default function Logo({ size = 40, className = '', alt = 'FRVV', ...props }) {
  return (
    <img
      src="/frvv-logo.png"
      alt={alt}
      width={size}
      height={size}
      className={`object-contain ${className}`}
      {...props}
    />
  );
}
