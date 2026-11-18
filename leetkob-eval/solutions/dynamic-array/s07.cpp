#include <cstdio>

int* arr;
int cnt = 0, cap = 2;

void them(int x) {
    if (cnt == cap) {
        int* moi = new int[cap * 2];
        for (int i = 0; i < cnt; i++) moi[i] = arr[i];
        arr = moi;
        cap *= 2;
    }
    arr[cnt++] = x;
}

int main() {
    arr = new int[cap];
    int x;
    while (scanf("%d", &x) != EOF) them(x);
    printf("%d\n", cnt);
    for (int i = cnt - 1; i >= 0; i--) printf("%d ", arr[i]);
    printf("\n");
    delete[] arr;
    return 0;
}
