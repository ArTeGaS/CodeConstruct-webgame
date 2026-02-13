"""Результат: програма має вивести найбільше число у списку."""

nums = [3, 7, 2, 9, 5]

max_num = nums[0]
for n in nums:
    if n > max_num:
        max_num = n
  print("Найбільше:", max_num)
