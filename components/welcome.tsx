import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import Chat from './ui/Chat';

interface WelcomeProps {
  disabled: boolean;
  startButtonText: string;
  onStartCall: () => void;
}

export const Welcome = ({
  disabled,
  startButtonText,
  onStartCall,
  ref,
}: React.ComponentProps<'div'> & WelcomeProps) => {
  return (
    <section
      ref={ref}
      inert={disabled}
      className={cn(
        'bg-background fixed inset-0 mx-auto flex h-svh flex-row items-center justify-center text-center',
        disabled ? 'z-10' : 'z-20'
      )}
    >
      <Chat onStartCall={onStartCall} disabled={disabled} />
    </section>
  );
};
