import React from 'react';
import classNames from 'classnames';

export default function Button({ children, onClick, variant = 'primary', size = 'md', className, disabled = false, loading = false, ...rest }) {
  const base = 'btn';
  const classes = classNames(base, `${base}--${variant}`, `${base}--${size}`, className, {
    'btn--disabled': disabled || loading,
  });

  return (
    <button className={classes} onClick={onClick} disabled={disabled || loading} {...rest}>
      {loading ? <span className="btn__spinner" aria-hidden /> : null}
      <span className="btn__label">{children}</span>
    </button>
  );
}