"""Результат: програма має вивести, скільки букв у слові."""

def count_letters(word):
    return len(word)

word = input("Введи слово: ")

if len(word) > 0:
    print("Кількість букв:", count_letters(word))
else:
    print("Слово порожнє")

"""
Помилка: пропущена двокрапка після керуючої конструкції.
Виправлення: додано двокрапку після if/for/while/def.
"""
