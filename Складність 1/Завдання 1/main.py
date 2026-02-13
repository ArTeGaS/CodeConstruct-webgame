"""Результат: програма має вивести кількість голосних у слові."""

    word = input("Введи слово: ")

vowels = "аеєиіїоуюя"
count = 0

for ch in word:
    if ch.lower() in vowels:
        count += 1

    print("Голосних:", count)
