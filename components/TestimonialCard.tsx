import { Quote } from 'lucide-react';
import Image from 'next/image';

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
    if (!name || name.trim().length === 0) {
      return '??'; // Fallback for empty names
    }
    
    const trimmedName = name.trim();
    const names = trimmedName.split(' ').filter(n => n.length > 0);
    
    if (names.length >= 2) {
      return `${names[0][0]}${names[names.length - 1][0]}`.toUpperCase();
    }
    
    // For single name, use first two characters (or pad with ?)
    return (trimmedName.substring(0, 2) + '?').substring(0, 2).toUpperCase();
  };

  // Generate a consistent color based on author name
  const getAvatarColor = (name: string) => {
    const colors = [
      'from-blue-500 to-blue-700',
      'from-purple-500 to-purple-700',
      'from-pink-500 to-pink-700',
      'from-green-500 to-green-700',
      'from-orange-500 to-orange-700',
      'from-teal-500 to-teal-700',
    ];
    
    if (!name || name.trim().length === 0) {
      return colors[0]; // Default to first color
    }
    
    const index = name.charCodeAt(0) % colors.length;
    return colors[index];
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
            <Image
              src={image}
              alt={author}
              width={48}
              height={48}
              className="w-12 h-12 rounded-full object-cover border-2 border-primary-100"
            />
          ) : (
            <div className={`w-12 h-12 rounded-full bg-gradient-to-br ${getAvatarColor(author)} flex items-center justify-center border-2 border-white shadow-md`}>
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
          <p className="text-sm text-gray-700 truncate">
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

