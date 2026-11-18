#include <cstdio>
#include <cstdlib>

int main() {
    int sucChua = 1, soLuong = 0;
    int* mang = (int*)malloc(sucChua * sizeof(int));
    int x;
    while (scanf("%d", &x) == 1) {
        if (soLuong == sucChua) {
            sucChua *= 2;
            mang = (int*)realloc(mang, sucChua * sizeof(int));
        }
        mang[soLuong++] = x;
    }
    printf("%d\n", soLuong);
    for (int i = soLuong - 1; i >= 0; i--) printf("%d ", mang[i]);
    printf("\n");
    free(mang);
    return 0;
}
