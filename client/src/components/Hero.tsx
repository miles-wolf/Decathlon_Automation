export function Hero() {
  return (
    <section className="border-b bg-gradient-to-b from-background to-muted/30">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 py-12 sm:py-16">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div>
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold tracking-tight">
              Simple, modular tools for running Decathlon Sports Camp with ease
            </h1>
            <p className="mt-3 max-w-2xl text-muted-foreground">
              Start with job assignments today. Add schedule builders, tournament team builders, digitized binders and more later - all in one place. That way you and your staff can focus less on paperwork and more on having fun in the summer sun with the kids.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
