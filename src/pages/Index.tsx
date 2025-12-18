import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Scissors, ArrowRight } from 'lucide-react';

const Index = () => {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/3 left-1/4 w-[500px] h-[500px] bg-brand-gold/5 rounded-full blur-3xl" />
        <div className="absolute bottom-1/3 right-1/4 w-[400px] h-[400px] bg-brand-green/5 rounded-full blur-3xl" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="text-center relative z-10 px-4"
      >
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.2, duration: 0.4 }}
          className="inline-flex items-center justify-center w-20 h-20 rounded-2xl gradient-gold mb-6 shadow-glow"
        >
          <Scissors className="w-10 h-10 text-brand-black" />
        </motion.div>

        <h1 className="text-4xl md:text-5xl font-display font-bold text-foreground mb-4">
          C-Mac Barbershop
        </h1>
        <p className="text-xl text-muted-foreground mb-8 max-w-md mx-auto">
          Admin Attendance Dashboard
        </p>

        <Link to="/auth">
          <Button size="lg" className="gradient-gold text-brand-black font-semibold hover:opacity-90 shadow-glow-sm">
            Get Started
            <ArrowRight className="w-5 h-5 ml-2" />
          </Button>
        </Link>
      </motion.div>
    </div>
  );
};

export default Index;
