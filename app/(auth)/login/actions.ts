"use server"

import { AuthError } from "next-auth"
import { signIn } from "@/auth"

export async function loginAction(
  formData: FormData
): Promise<{ error?: string } | void> {
  try {
    await signIn("credentials", {
      username: formData.get("username"),
      password: formData.get("password"),
      redirect: false,
    })
  } catch (err) {
    if (err instanceof AuthError) {
      if (err.type === "CredentialsSignin") {
        return { error: "Kullanıcı adı veya şifre hatalı." }
      }
      return { error: "Giriş sırasında bir hata oluştu." }
    }
    throw err
  }
}
