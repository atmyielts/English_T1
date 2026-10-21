import type { InvitationView } from "./invitation-handler.ts";
import {
  type StaffCapability,
  staffLabels,
} from "../../../packages/assessment-core/src/staff.ts";
const copy = {
  en: {
    subject: "Your Schood Assessment Cloud invitation",
    reminder: "Reminder: your Assessment Cloud invitation",
    intro:
      "You have been invited to an institution’s Assessment Cloud workspace.",
    review: "Review invitation",
    role: "Role",
    version: "version",
    expires: "Accept before",
    access: "Role access ends",
    ongoing: "Role access has no scheduled expiry.",
    boundary:
      "This invitation grants Assessment Cloud permissions only, not Academy or Proctor membership.",
    verify:
      "Sign in with this recipient’s verified Schood email. Review the institution, role and permissions before accepting.",
    ignore:
      "If you did not expect this invitation, do not accept it. Ask the institution to revoke it.",
    utc: "All times below are UTC.",
  },
  uz: {
    subject: "Schood Assessment Cloud xizmatiga taklif",
    reminder: "Eslatma: Assessment Cloud xizmatiga taklif",
    intro:
      "Siz muassasaning Assessment Cloud ish maydoniga taklif qilindingiz.",
    review: "Taklifni ko‘rib chiqish",
    role: "Rol",
    version: "versiya",
    expires: "Taklifni qabul qilish muddati",
    access: "Rolga kirish muddati",
    ongoing: "Rolga kirish uchun tugash muddati belgilanmagan.",
    boundary:
      "Bu taklif faqat Assessment Cloud huquqlarini beradi. Academy yoki Proctor a’zoligini bermaydi.",
    verify:
      "Taklif yuborilgan tasdiqlangan Schood elektron pochtangiz bilan kiring. Qabul qilishdan oldin muassasa, rol va huquqlarni tekshiring.",
    ignore:
      "Bu taklifni kutmagan bo‘lsangiz, uni qabul qilmang. Muassasadan taklifni bekor qilishni so‘rang.",
    utc: "Quyidagi barcha vaqtlar UTC bo‘yicha.",
  },
  ru: {
    subject: "Приглашение в Schood Assessment Cloud",
    reminder: "Напоминание о приглашении в Assessment Cloud",
    intro:
      "Вас пригласили в рабочее пространство учреждения в Assessment Cloud.",
    review: "Проверить приглашение",
    role: "Роль",
    version: "версия",
    expires: "Срок принятия приглашения",
    access: "Срок действия прав",
    ongoing: "Срок окончания доступа для роли не установлен.",
    boundary:
      "Это приглашение даёт права только в Assessment Cloud, без членства в Academy или Proctor.",
    verify:
      "Войдите с подтверждённой почтой Schood, на которую отправлено приглашение. Перед принятием проверьте учреждение, роль и права.",
    ignore:
      "Если вы не ожидали приглашение, не принимайте его. Попросите учреждение отозвать его.",
    utc: "Все указанные ниже даты и время приведены в UTC.",
  },
};
const labels: Record<"uz" | "ru", Record<StaffCapability, string>> = {
  uz: {
    "banks.read": "Savollar banklarini ko‘rish",
    "items.write": "Savollar va baholash mezonlarini yaratish",
    "items.approve": "Tekshirilgan savollarni tasdiqlash",
    "assessments.publish": "Test versiyalarini nashr qilish",
    "exams.manage":
      "Imtihonlarni rejalashtirish va nomzodlarni ro‘yxatga olish",
    "grades.mark": "Biriktirilgan javoblarni baholash",
    "grades.moderate": "Baholovchilarni tayinlash va baholarni tasdiqlash",
    "results.read": "Muassasa natijalarini ko‘rish",
    "results.release": "Tasdiqlangan natijalarni chiqarish",
    "audit.read": "Tekshiruv tarixini ko‘rish",
    "team.manage": "Assessment xodimlari huquqlarini boshqarish",
    "certificates.manage":
      "Sertifikat dasturlarini tasdiqlash, sertifikat berish va bekor qilish",
  },
  ru: {
    "banks.read": "Просмотр банков вопросов",
    "items.write": "Создание вопросов и критериев оценивания",
    "items.approve": "Утверждение проверенных вопросов",
    "assessments.publish": "Публикация версий тестов",
    "exams.manage": "Планирование экзаменов и регистрация участников",
    "grades.mark": "Оценивание назначенных ответов",
    "grades.moderate": "Назначение проверяющих и утверждение оценок",
    "results.read": "Просмотр результатов учреждения",
    "results.release": "Публикация утверждённых результатов",
    "audit.read": "Просмотр истории аудита",
    "team.manage": "Управление правами сотрудников Assessment",
    "certificates.manage": "Утверждение программ, выдача и отзыв сертификатов",
  },
};
const escape = (value: unknown) =>
  String(value).replace(
    /[&<>"']/g,
    (c) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[c]!),
  );
export function invitationMailTemplate(
  id: string,
  locale: "uz" | "ru" | "en",
  kind: string,
  invitation: InvitationView,
  institution: string,
  url: string,
) {
  const c = copy[locale],
    caps = (invitation.capabilities as StaffCapability[]).map((cap) =>
      locale === "en" ? staffLabels[cap] : labels[locale][cap]
    ),
    role =
      `${c.role}: ${invitation.role_title} · ${c.version} ${invitation.role_version}`,
    deadline = `${c.expires}: ${
      new Date(String(invitation.expires_at)).toISOString()
    }`,
    access = invitation.permission_expires_at
      ? `${c.access}: ${
        new Date(String(invitation.permission_expires_at)).toISOString()
      }`
      : c.ongoing,
    lines = [
      institution,
      c.intro,
      role,
      ...caps.map((cap) => "• " + cap),
      deadline,
      access,
      c.utc,
      c.boundary,
      c.verify,
      c.review + ": " + url,
      c.ignore,
    ];
  return {
    id,
    to: String(invitation.recipient_email),
    subject: kind === "reminder" ? c.reminder : c.subject,
    text: lines.join("\n\n"),
    html:
      `<!doctype html><html lang="${locale}"><meta charset="utf-8"><body style="margin:0;padding:24px;background:#f5f1e8;color:#111827;font-family:Arial,sans-serif"><main style="max-width:600px;margin:auto;padding:28px;background:white;border:1px solid #111827;border-radius:24px"><p>Schood · Assessment Cloud</p><h1 style="font-size:24px">${
        escape(institution)
      }</h1><p>${escape(c.intro)}</p><h2 style="font-size:19px">${
        escape(role)
      }</h2><ul>${
        caps.map((cap) => `<li>${escape(cap)}</li>`).join("")
      }</ul><p>${escape(deadline)}</p><p>${escape(access)}</p><p>${
        escape(c.utc)
      }</p><p>${escape(c.boundary)}</p><p>${escape(c.verify)}</p><p><a href="${
        escape(url)
      }" style="display:inline-block;padding:14px 22px;border-radius:999px;background:#111827;color:white;text-decoration:none">${
        escape(c.review)
      }</a></p><p style="overflow-wrap:anywhere">${escape(url)}</p><p>${
        escape(c.ignore)
      }</p></main></body></html>`,
  };
}
