import TestimonialCard from './TestimonialCard';

interface Testimonial {
  quote: string;
  author: string;
  role: string;
  company?: string;
  image?: string;
}

interface TestimonialsSectionProps {
  title?: string;
  testimonials?: Testimonial[];
}

// Default placeholder testimonials
const defaultTestimonials: Testimonial[] = [
  {
    quote: "Finally, a job board that understands what PMHNPs are looking for. Found my dream remote position in just two weeks!",
    author: "Sarah M.",
    role: "PMHNP",
    company: "Telehealth Provider"
  },
  {
    quote: "The salary transparency is a game-changer. No more guessing or wasting time on lowball offers.",
    author: "Michael R.",
    role: "PMHNP",
    company: "Community Mental Health"
  },
  {
    quote: "We filled our PMHNP position in under a month. The candidates were all qualified and genuinely interested.",
    author: "Jennifer L.",
    role: "HR Director",
    company: "Regional Health System"
  }
];

export default function TestimonialsSection({
  title = "What People Are Saying",
  testimonials = defaultTestimonials,
}: TestimonialsSectionProps) {
  return (
    <section className="py-16 px-4 sm:px-6 lg:px-8 bg-gray-50">
      <div className="max-w-7xl mx-auto">
        {/* Section Heading */}
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
            {title}
          </h2>
          <div className="w-20 h-1 bg-gradient-to-r from-primary-500 to-primary-700 mx-auto rounded-full"></div>
        </div>

        {/* Testimonials Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {testimonials.map((testimonial: Testimonial, index: number) => (
            <TestimonialCard
              key={index}
              quote={testimonial.quote}
              author={testimonial.author}
              role={testimonial.role}
              company={testimonial.company}
              image={testimonial.image}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

