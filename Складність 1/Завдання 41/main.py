"""Результат: програма має вивести кількість символів у рядку."""

def count_chars(text):
    return 1 + count_chars(text[1:])

text = input("Введи рядок: ")
print("Кількість:", count_chars(text))
