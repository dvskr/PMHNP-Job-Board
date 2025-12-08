import { Quote } from 'lucide-react';

interface TestimonialCardProps {
  quote: string;
  author: string;
  role: string;
  company?: string;
  image?: string;
}

export default function TestimonialCard({
  quote,
  author,
  role,
  company,
  image,
}: TestimonialCardProps) {
  // Generate initials from author name
  const getInitials = (name: string) => {
    const names = name.trim().split(' ');
    if (names.length >= 2) {
      return `${names[0][0]}${names[names.length - 1][0]}`.toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  };

  return (
    <div className="bg-white rounded-xl shadow-card p-6 border border-gray-100 hover:shadow-card-hover transition-shadow duration-200">
      {/* Quote Icon */}
      <div className="mb-4">
        <Quote className="w-8 h-8 text-primary-200" />
      </div>

      {/* Quote Text */}
      <blockquote className="mb-6">
        <p className="text-gray-700 italic leading-relaxed">
          &ldquo;{quote}&rdquo;
        </p>
      </blockquote>

      {/* Author Info */}
      <div className="flex items-center gap-4">
        {/* Avatar */}
        <div className="flex-shrink-0">
          {image ? (
            <img
              src={image}
              alt={author}
              className="w-12 h-12 rounded-full object-cover border-2 border-primary-100"
            />
          ) : (
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center border-2 border-primary-100">
              <span className="text-white font-semibold text-sm">
                {getInitials(author)}
              </span>
            </div>
          )}
        </div>

        {/* Author Details */}
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-900 truncate">
            {author}
          </p>
          <p className="text-sm text-gray-600 truncate">
            {role}
          </p>
          {company && (
            <p className="text-sm text-primary-600 truncate">
              {company}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

