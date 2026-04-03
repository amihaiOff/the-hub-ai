'use client';

import { useRef, useState } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Trash2, Minus, Plus } from 'lucide-react';

interface CartItemRowProps {
  id: string;
  name: string;
  quantity: number;
  checked: boolean;
  onToggle: (id: string, checked: boolean) => void;
  onQuantityChange: (id: string, quantity: number) => void;
  onRemove: (id: string) => void;
}

export function CartItemRow({
  id,
  name,
  quantity,
  checked,
  onToggle,
  onQuantityChange,
  onRemove,
}: CartItemRowProps) {
  const touchStartX = useRef<number>(0);
  const [translateX, setTranslateX] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    setIsSwiping(true);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isSwiping) return;
    const deltaX = e.touches[0].clientX - touchStartX.current;
    // Clamp to reasonable range
    setTranslateX(Math.max(-200, Math.min(200, deltaX)));
  };

  const handleTouchEnd = () => {
    setIsSwiping(false);
    if (Math.abs(translateX) > 100) {
      onRemove(id);
    }
    setTranslateX(0);
  };

  return (
    <div className="relative overflow-hidden rounded-md">
      {/* Red background revealed on swipe */}
      <div className="absolute inset-0 flex items-center justify-between bg-red-600 px-4">
        <Trash2 className="h-5 w-5 text-white" />
        <Trash2 className="h-5 w-5 text-white" />
      </div>

      {/* Foreground row */}
      <div
        className="bg-card relative flex items-center gap-3 px-4 py-3"
        style={{
          transform: `translateX(${translateX}px)`,
          touchAction: 'pan-y',
          transition: isSwiping ? 'none' : 'transform 300ms ease-out',
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <Checkbox
          checked={checked}
          onCheckedChange={(value) => onToggle(id, Boolean(value))}
          className="border-muted-foreground data-[state=checked]:border-primary data-[state=checked]:bg-primary h-5 w-5 border-2"
        />
        <span
          className={`min-w-0 flex-1 truncate text-sm ${
            checked ? 'text-muted-foreground line-through' : 'text-foreground'
          }`}
        >
          {name}
        </span>
        {/* Quantity controls */}
        <div className="flex shrink-0 items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => onQuantityChange(id, Math.max(1, quantity - 1))}
            disabled={quantity <= 1 || checked}
          >
            <Minus className="h-3 w-3" />
          </Button>
          <span className="text-muted-foreground w-5 text-center text-xs tabular-nums">
            {quantity}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => onQuantityChange(id, quantity + 1)}
            disabled={checked}
          >
            <Plus className="h-3 w-3" />
          </Button>
        </div>
        {/* Desktop delete button (swipe is touch-only) */}
        <Button
          variant="ghost"
          size="icon"
          className="text-muted-foreground hover:text-destructive hidden h-7 w-7 sm:flex"
          onClick={() => onRemove(id)}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
