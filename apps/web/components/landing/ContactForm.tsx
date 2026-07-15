"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useState, type FormEvent } from "react";
import { Button, Input, Surface, TextArea } from "@blueprint/ui";
import { IconCheck } from "@/components/workspace/icons";

interface FormValues {
  name: string;
  email: string;
  company: string;
  subject: string;
  message: string;
}

const INITIAL_VALUES: FormValues = { name: "", email: "", company: "", subject: "", message: "" };

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validate(values: FormValues): Partial<Record<keyof FormValues, string>> {
  const errors: Partial<Record<keyof FormValues, string>> = {};
  if (!values.name.trim()) errors.name = "Tell us who you are.";
  if (!values.email.trim()) {
    errors.email = "An email address is required.";
  } else if (!EMAIL_PATTERN.test(values.email.trim())) {
    errors.email = "That doesn't look like a valid email address.";
  }
  if (!values.subject.trim()) errors.subject = "Give it a short subject.";
  if (!values.message.trim()) {
    errors.message = "Write the message you want to send.";
  } else if (values.message.trim().length < 10) {
    errors.message = "A little more detail helps — at least 10 characters.";
  }
  return errors;
}

/** No backend endpoint exists yet for contact submissions — this
 * validates thoroughly and simulates the send so the form is honest
 * about being unfinished plumbing without looking unfinished. Wiring a
 * real delivery path (email, ticketing) is a separate, explicit change. */
export function ContactForm() {
  const reduceMotion = useReducedMotion();
  const [values, setValues] = useState<FormValues>(INITIAL_VALUES);
  const [errors, setErrors] = useState<Partial<Record<keyof FormValues, string>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  function updateField<K extends keyof FormValues>(key: K, value: string) {
    setValues((current) => ({ ...current, [key]: value }));
    if (errors[key]) setErrors((current) => ({ ...current, [key]: undefined }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors = validate(values);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSubmitting(true);
    await new Promise((resolve) => setTimeout(resolve, 700));
    setSubmitting(false);
    setSubmitted(true);
  }

  if (submitted) {
    return (
      <Surface padding="lg" className="flex flex-col items-center gap-4 py-16 text-center">
        <motion.span
          initial={reduceMotion ? false : { scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 300, damping: 18 }}
          className="flex size-14 items-center justify-center rounded-full bg-status-ready/10 text-status-ready-deep dark:text-status-ready"
        >
          <IconCheck className="size-6" />
        </motion.span>
        <h2 className="text-xl font-semibold text-ink-950 dark:text-ink-50">Message sent.</h2>
        <p className="max-w-sm text-sm leading-relaxed text-ink-500 dark:text-ink-400">
          Thanks, {values.name.split(" ")[0] || "there"} — we&apos;ve got it and will get back to
          you at {values.email}.
        </p>
        <Button
          variant="ghost"
          size="md"
          onClick={() => {
            setValues(INITIAL_VALUES);
            setSubmitted(false);
          }}
          className="mt-2"
        >
          Send another message
        </Button>
      </Surface>
    );
  }

  return (
    <Surface padding="lg" as="div">
      <AnimatePresence mode="wait" initial={false}>
        <motion.form
          key="contact-form"
          initial={reduceMotion ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: "easeOut" }}
          onSubmit={handleSubmit}
          noValidate
          className="flex flex-col gap-5"
        >
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <Input
              label="Name"
              required
              value={values.name}
              onChange={(event) => updateField("name", event.target.value)}
              error={errors.name}
              autoComplete="name"
            />
            <Input
              label="Email"
              type="email"
              required
              value={values.email}
              onChange={(event) => updateField("email", event.target.value)}
              error={errors.email}
              autoComplete="email"
            />
          </div>

          <Input
            label="Company"
            hint="Optional"
            value={values.company}
            onChange={(event) => updateField("company", event.target.value)}
            autoComplete="organization"
          />

          <Input
            label="Subject"
            required
            value={values.subject}
            onChange={(event) => updateField("subject", event.target.value)}
            error={errors.subject}
          />

          <TextArea
            label="Message"
            required
            rows={6}
            value={values.message}
            onChange={(event) => updateField("message", event.target.value)}
            error={errors.message}
          />

          <Button type="submit" variant="primary" size="lg" loading={submitting} className="mt-2 self-start">
            {submitting ? "Sending…" : "Send message"}
          </Button>
        </motion.form>
      </AnimatePresence>
    </Surface>
  );
}
