export function Hero() {
  return (
    <section className="border-b bg-gradient-to-b from-background to-muted/30">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 pt-12 sm:pt-16 pb-8 sm:pb-10">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div>
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold tracking-tight">
              Simple tools for running camp with ease
            </h1>
            <p className="mt-5 max-w-2xl text-muted-foreground">
              Focus less on paperwork and more on having fun in the sun with the kids.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
