declare module "interval-arithmetic-eval" {
    export default function compile(input: string): { eval(scope: Record<string, import("interval-arithmetic").Interval>): import("interval-arithmetic").Interval }
}