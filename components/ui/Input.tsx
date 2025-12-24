import React, { useId } from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  className?: string;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  (
    {
      label,
      error,
      hint,
      leftIcon,
      rightIcon,
      className = '',
      id,
      ...props
    },
    ref
  ) => {
    // Generate ID for label association if not provided using React's useId hook
    const generatedId = useId();
    const inputId = id || generatedId;

    // Base input styles
    const baseInputStyles = 'w-full px-4 py-2.5 border rounded-lg text-gray-900 placeholder:text-gray-400 transition-colors duration-200';
    
    // Focus and error styles
    const focusStyles = error
      ? 'border-red-500 focus:border-red-500 focus:ring-2 focus:ring-red-100 focus:outline-none'
      : 'border-gray-300 focus:border-primary-500 focus:ring-2 focus:ring-primary-100 focus:outline-none';

    // Adjust padding if icons are present
    const paddingStyles = leftIcon
      ? 'pl-10'
      : rightIcon
      ? 'pr-10'
      : '';

    // Combine all input styles
    const inputClasses = [
      baseInputStyles,
      focusStyles,
      paddingStyles,
      className,
    ]
      .filter(Boolean)
      .join(' ');

    return (
      <div className="w-full">
        {/* Label */}
        {label && (
          <label
            htmlFor={inputId}
            className="block mb-1.5 text-sm font-medium text-gray-700"
          >
            {label}
          </label>
        )}

        {/* Input Container */}
        <div className="relative">
          {/* Left Icon */}
          {leftIcon && (
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
              {leftIcon}
            </div>
          )}

          {/* Input Field */}
          <input
            ref={ref}
            id={inputId}
            className={inputClasses}
            {...props}
          />

          {/* Right Icon */}
          {rightIcon && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
              {rightIcon}
            </div>
          )}
        </div>

        {/* Error Message */}
        {error && (
          <p className="mt-1.5 text-sm text-red-600">
            {error}
          </p>
        )}

        {/* Hint Text */}
        {hint && !error && (
          <p className="mt-1.5 text-sm text-gray-500">
            {hint}
          </p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';

export default Input;

