// @ts-nocheck
'use client';

import * as React from 'react';
import type { ComponentPropsWithoutRef, ElementRef, ForwardedRef } from 'react';
import * as SelectPrimitive from '@radix-ui/react-select';
import { Check, ChevronDown, ChevronUp } from 'lucide-react';

import { cn } from '@/lib/utils';

const Select = SelectPrimitive.Root as unknown as (props: SelectPrimitive.SelectProps) => React.ReactElement | null;

const SelectGroup: typeof SelectPrimitive.Group = SelectPrimitive.Group;

const SelectValue: typeof SelectPrimitive.Value = SelectPrimitive.Value;

type TriggerRef = ElementRef<typeof SelectPrimitive.Trigger>;
type TriggerProps = ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger>;

const SelectTrigger = React.forwardRef(function SelectTrigger(
  { className, children, ...props }: TriggerProps,
  ref: ForwardedRef<TriggerRef>
) {
  return (
    <SelectPrimitive.Trigger
      ref={ref}
      className={cn(
        'flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 [&>span]:line-clamp-1',
        className
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon asChild>
        <ChevronDown className="h-4 w-4 opacity-50" />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  );
}) as typeof SelectPrimitive.Trigger;
SelectTrigger.displayName = SelectPrimitive.Trigger.displayName;

type ScrollButtonRef = ElementRef<typeof SelectPrimitive.ScrollUpButton>;
type ScrollButtonProps = ComponentPropsWithoutRef<typeof SelectPrimitive.ScrollUpButton>;

const SelectScrollUpButton = React.forwardRef(function SelectScrollUpButton(
  { className, ...props }: ScrollButtonProps,
  ref: ForwardedRef<ScrollButtonRef>
) {
  return (
    <SelectPrimitive.ScrollUpButton ref={ref} className={cn('flex cursor-default items-center justify-center py-1', className)} {...props}>
      <ChevronUp className="h-4 w-4" />
    </SelectPrimitive.ScrollUpButton>
  );
}) as typeof SelectPrimitive.ScrollUpButton;
SelectScrollUpButton.displayName = SelectPrimitive.ScrollUpButton.displayName;

type ScrollDownRef = ElementRef<typeof SelectPrimitive.ScrollDownButton>;
type ScrollDownProps = ComponentPropsWithoutRef<typeof SelectPrimitive.ScrollDownButton>;

const SelectScrollDownButton = React.forwardRef(function SelectScrollDownButton(
  { className, ...props }: ScrollDownProps,
  ref: ForwardedRef<ScrollDownRef>
) {
  return (
    <SelectPrimitive.ScrollDownButton ref={ref} className={cn('flex cursor-default items-center justify-center py-1', className)} {...props}>
      <ChevronDown className="h-4 w-4" />
    </SelectPrimitive.ScrollDownButton>
  );
}) as typeof SelectPrimitive.ScrollDownButton;
SelectScrollDownButton.displayName = SelectPrimitive.ScrollDownButton.displayName;

type ContentRef = ElementRef<typeof SelectPrimitive.Content>;
type ContentProps = ComponentPropsWithoutRef<typeof SelectPrimitive.Content>;

const SelectContent = React.forwardRef(function SelectContent(
  { className, children, position = 'popper', ...props }: ContentProps,
  ref: ForwardedRef<ContentRef>
) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        ref={ref}
        className={cn(
          'relative z-50 max-h-96 min-w-[8rem] overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2',
          position === 'popper' &&
            'data-[side=bottom]:translate-y-1 data-[side=left]:-translate-x-1 data-[side=right]:translate-x-1 data-[side=top]:-translate-y-1',
          className
        )}
        position={position}
        {...props}
      >
        <SelectScrollUpButton />
        <SelectPrimitive.Viewport
          className={cn(
            'p-1',
            position === 'popper' && 'h-[var(--radix-select-trigger-height)] w-full min-w-[var(--radix-select-trigger-width)]'
          )}
        >
          {children}
        </SelectPrimitive.Viewport>
        <SelectScrollDownButton />
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  );
}) as typeof SelectPrimitive.Content;
SelectContent.displayName = SelectPrimitive.Content.displayName;

type LabelRef = ElementRef<typeof SelectPrimitive.Label>;
type LabelProps = ComponentPropsWithoutRef<typeof SelectPrimitive.Label>;

const SelectLabel = React.forwardRef(function SelectLabel(
  { className, ...props }: LabelProps,
  ref: ForwardedRef<LabelRef>
) {
  return <SelectPrimitive.Label ref={ref} className={cn('py-1.5 pl-8 pr-2 text-sm font-semibold', className)} {...props} />;
}) as typeof SelectPrimitive.Label;
SelectLabel.displayName = SelectPrimitive.Label.displayName;

type ItemRef = ElementRef<typeof SelectPrimitive.Item>;
type ItemProps = ComponentPropsWithoutRef<typeof SelectPrimitive.Item>;

const SelectItem = React.forwardRef(function SelectItem(
  { className, children, ...props }: ItemProps,
  ref: ForwardedRef<ItemRef>
) {
  return (
    <SelectPrimitive.Item
      ref={ref}
      className={cn(
        'relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
        className
      )}
      {...props}
    >
      <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
        <SelectPrimitive.ItemIndicator>
          <Check className="h-4 w-4" />
        </SelectPrimitive.ItemIndicator>
      </span>

      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
  );
}) as typeof SelectPrimitive.Item;
SelectItem.displayName = SelectPrimitive.Item.displayName;

type SeparatorRef = ElementRef<typeof SelectPrimitive.Separator>;
type SeparatorProps = ComponentPropsWithoutRef<typeof SelectPrimitive.Separator>;

const SelectSeparator = React.forwardRef(function SelectSeparator(
  { className, ...props }: SeparatorProps,
  ref: ForwardedRef<SeparatorRef>
) {
  return <SelectPrimitive.Separator ref={ref} className={cn('-mx-1 my-1 h-px bg-muted', className)} {...props} />;
}) as typeof SelectPrimitive.Separator;
SelectSeparator.displayName = SelectPrimitive.Separator.displayName;

export {
  Select,
  SelectGroup,
  SelectValue,
  SelectTrigger,
  SelectContent,
  SelectLabel,
  SelectItem,
  SelectSeparator,
  SelectScrollUpButton,
  SelectScrollDownButton
};
