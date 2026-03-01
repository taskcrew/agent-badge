import { test, expect } from "bun:test";
import { extractOtp } from "../otp-utils";

test("extracts 6-digit OTP after 'verification code' label", () => {
  expect(extractOtp("Your verification code is 847291")).toBe("847291");
});

test("extracts 6-digit OTP after 'one-time code' label", () => {
  expect(extractOtp("Your one-time code: 123456")).toBe("123456");
});

test("extracts OTP from 'X is your code' pattern", () => {
  expect(extractOtp("483920 is your verification code")).toBe("483920");
});

test("extracts 4-digit OTP", () => {
  expect(extractOtp("Your OTP is 4829")).toBe("4829");
});

test("extracts 8-digit OTP", () => {
  expect(extractOtp("Security code: 12345678")).toBe("12345678");
});

test("extracts OTP from HTML email body", () => {
  const html = '<p>Your verification code is <strong>192837</strong></p>';
  expect(extractOtp(html)).toBe("192837");
});

test("skips year-like 4-digit numbers", () => {
  // Should skip 2024 (year) and find the actual OTP
  expect(extractOtp("In 2024, your OTP is 9182")).toBe("9182");
});

test("returns null when no OTP found", () => {
  expect(extractOtp("Hello, welcome to our service!")).toBeNull();
});

test("extracts OTP with 'access code' label", () => {
  expect(extractOtp("Your access code is 738291")).toBe("738291");
});

test("extracts OTP with 'confirmation code' label", () => {
  expect(extractOtp("Confirmation code: 564738")).toBe("564738");
});

test("handles 'one-time password' label", () => {
  expect(extractOtp("Your one-time password: 293847")).toBe("293847");
});
