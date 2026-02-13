"""Результат: програма має вивести факторіал числа."""

def factorial(n):
    return n * factorial(n - 1)

n = int(input("Введи число: "))
print("Факторіал:", factorial(n))
