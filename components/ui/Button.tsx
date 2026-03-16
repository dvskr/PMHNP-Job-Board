import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
  children: React.ReactNode;
  className?: string;
}

// Loading spinner component - defined outside the Button component to avoid recreation on each render
const Spinner = () => (
  <svg
    className="animate-spin h-4 w-4"
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
  >
    <circle
      className="opacity-25"
      cx="12"
      cy="12"
      r="10"
      stroke="currentColor"
      strokeWidth="4"
    ></circle>
    <path
      className="opacity-75"
      fill="currentColor"
      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
    ></path>
  </svg>
);

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'primary',
      size = 'md',
      isLoading = false,
      disabled = false,
      children,
      className = '',
      type = 'button',
      ...props
    },
    ref
  ) => {
    // Base styles for all buttons
    const baseStyles = 'rounded-lg font-medium transition-all duration-200 inline-flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed active:scale-95';

    // Variant styles
    const variantStyles = {
      primary: 'bg-teal-600 hover:bg-teal-700 text-white shadow-sm hover:shadow-md hover:-translate-y-0.5',
      secondary: 'bg-gray-100 hover:bg-gray-200 text-gray-900 hover:shadow-sm',
      outline: 'border border-gray-300 hover:border-teal-500 text-gray-700 hover:text-teal-600 bg-transparent hover:bg-teal-50 hover:-translate-y-0.5',
      ghost: 'bg-transparent hover:bg-gray-100 text-gray-600 hover:text-gray-900',
      danger: 'bg-red-600 hover:bg-red-700 text-white',
    };

    // Size styles
    const sizeStyles = {
      sm: 'px-3 py-1.5 text-sm',
      md: 'px-4 py-2 text-base',
      lg: 'px-6 py-3 text-lg',
    };

    // Combine all styles
    const buttonClasses = [
      baseStyles,
      variantStyles[variant],
      sizeStyles[size],
      className,
    ].join(' ');

    return (
      <button
        ref={ref}
        type={type}
        disabled={disabled || isLoading}
        className={buttonClasses}
        {...props}
      >
        {isLoading && <Spinner />}
        {children}
      </button>
    );
  }
);

Button.displayName = 'Button';

export default Button;

