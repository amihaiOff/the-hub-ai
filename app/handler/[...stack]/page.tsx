import { StackHandler } from '@stackframe/stack';
import { stackServerApp } from '@/stack/server';

export default function Handler(props: { params: Promise<{ stack: string[] }> }) {
  return <StackHandler fullPage app={stackServerApp} routeProps={props} />;
}
